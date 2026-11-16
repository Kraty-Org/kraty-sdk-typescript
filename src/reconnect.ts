import { KratyApiError } from './errors.js';
import type { SseEvent, SseStream } from './sse.js';

/**
 * Self-healing SSE streams: the reconnect loop behind `chat.live()`,
 * `inventory.live()` and `eventLeaderboards.subscribe()`.
 *
 * Kraty's servers come and go as the backend scales, and rebalance long-lived
 * streams every 45–75 minutes. The server says so with `event: close`
 * (`{ reason, retryAfterMs }`), a busy server refuses a new stream with
 * `503 + Retry-After`, and a dead socket goes quiet (the server pings every
 * 15 s). This loop turns all of that into a short `connection` blip:
 *
 * - `close`: wait `retryAfterMs`, reconnect. Never shown to the game.
 * - drop, read error, end of stream, or a retryable open failure (network,
 *   408, 429, 5xx): wait `Retry-After` when given, else a jittered backoff
 *   (1 s doubling, capped at 15 s). The attempt count resets once a
 *   connection sends `ready`.
 * - nothing at all (not even a ping) for `heartbeatTimeoutMs` (40 s) while
 *   waiting for data: the socket is dead, so close it and reconnect
 *   (`heartbeatTimeoutMs: 0` turns this watchdog off).
 * - any other 4xx on open (401, 403 `chat_disabled`, 404…) is a real
 *   refusal: the iterable throws it and stops.
 */

/** Connection status, delivered in the event stream. Not an error. */
export interface StreamConnectionEvent {
  kind: 'connection';
  /** `connected` after each (re)connect is live; `reconnecting` when it was lost. */
  state: 'connected' | 'reconnecting';
  /**
   * Why it reconnects: the server's `close` reason (`shutdown`,
   * `rebalance`, `slow_consumer`), or `heartbeat_timeout`, `busy`, `error`,
   * `ended`. Absent on `connected`.
   */
  reason?: string;
  /** Milliseconds until the next attempt (on `reconnecting`). */
  retryInMs?: number;
  /** Consecutive failed attempts so far (on `reconnecting`). */
  attempt?: number;
}

/** Options shared by every self-healing stream helper. */
export interface ReconnectOptions {
  /**
   * Reconnect on its own (default true). `false` restores the single
   * connection: the iterable yields `close` and throws on any drop, and you
   * reconnect yourself.
   */
  autoReconnect?: boolean;
  /**
   * Silence (no event, no ping) that counts as a dead connection. Default
   * 40 000 ms; 0 (or less) turns the watchdog off.
   */
  heartbeatTimeoutMs?: number;
}

export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 40_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;
/** Server hints above this are clamped, so a bad header can't park a stream for long. */
const MAX_HINT_MS = 60_000;

/** Is this error a refusal that reconnecting won't fix? */
export function isFatalStreamError(err: unknown): boolean {
  if (!(err instanceof KratyApiError)) return false;
  if (err.status >= 500 || err.status === 408 || err.status === 429) return false;
  return err.status >= 400;
}

/** Wait before reconnect attempt `attempt` (1-based): the server's hint, else jittered backoff. */
export function reconnectDelayMs(err: unknown, attempt: number): number {
  if (err instanceof KratyApiError && err.retryAfterSeconds !== null) {
    return Math.min(err.retryAfterSeconds * 1000, MAX_HINT_MS);
  }
  const base = Math.min(RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1), RECONNECT_MAX_MS);
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

class HeartbeatTimeout extends Error {
  constructor() {
    super('stream heartbeat timeout');
  }
}

export interface ReconnectingStreamArgs<T> {
  /** Opens one connection; must pass `onActivity` through to `openSseStream`. */
  open(onActivity: () => void): Promise<SseStream>;
  /** Map a wire event to what the game sees; null drops it. */
  map(ev: SseEvent): T | null;
  /** Events after which the stream is over for good (leaderboard `closed`). */
  isTerminal?(ev: SseEvent): boolean;
  /**
   * Runs after every `ready` with the mapped `ready` event and whether this
   * is a REconnect (false on the first connect): yields events to deliver
   * before any live event of the new connection. Throwing counts as a drop,
   * so it runs again after the next reconnect.
   */
  catchUp?(ready: T | null, reconnect: boolean): AsyncIterable<T>;
  /** Final filter for every event before it is delivered (dedupe). */
  accept?(ev: T): boolean;
  heartbeatTimeoutMs?: number;
}

/** A self-healing stream handle: same shape as a single-connection one. */
export interface ReconnectingStream<T> {
  events: AsyncIterable<T | StreamConnectionEvent>;
  close(): Promise<void>;
}

/**
 * Open a self-healing stream. The first attempt runs before this resolves:
 * a fatal refusal rejects (as a single connection would), a transient failure
 * doesn't (the stream starts out reconnecting).
 */
export async function openReconnectingStream<T>(args: ReconnectingStreamArgs<T>): Promise<ReconnectingStream<T>> {
  const heartbeatMs = args.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
  let closed = false;
  let current: SseStream | null = null;
  let activity: (() => void) | null = null;
  let wake: (() => void) | null = null;
  const onActivity = (): void => activity?.();

  let firstError: unknown = null;
  try {
    current = await args.open(onActivity);
  } catch (err) {
    if (isFatalStreamError(err)) throw err;
    firstError = err;
  }

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        wake = null;
        resolve();
      }, ms);
      wake = () => {
        clearTimeout(timer);
        wake = null;
        resolve();
      };
    });

  /** `it.next()`, failing with HeartbeatTimeout after `heartbeatMs` of silence (never when it's 0: watchdog off). */
  const nextWithWatchdog = (it: AsyncIterator<SseEvent>, conn: SseStream): Promise<IteratorResult<SseEvent>> =>
    heartbeatMs <= 0
      ? it.next()
      : new Promise((resolve, reject) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const arm = (): void => {
            if (timer !== undefined) clearTimeout(timer);
            timer = setTimeout(() => {
              activity = null;
              reject(new HeartbeatTimeout());
              void conn.close().catch(() => undefined);
            }, heartbeatMs);
          };
          const done = (): void => {
            if (timer !== undefined) clearTimeout(timer);
            activity = null;
          };
          activity = arm;
          arm();
          it.next().then(
            (r) => {
              done();
              resolve(r);
            },
            (e: unknown) => {
              done();
              reject(e);
            },
          );
        });

  async function* iterate(): AsyncGenerator<T | StreamConnectionEvent, void, unknown> {
    let attempt = 0;
    let firstConnect = true;
    let pendingReason = firstError ? reasonOf(firstError) : '';
    let pendingDelay = firstError ? reconnectDelayMs(firstError, ++attempt) : 0;
    try {
      while (!closed) {
        if (!current) {
          yield { kind: 'connection', state: 'reconnecting', reason: pendingReason, retryInMs: pendingDelay, attempt };
          if (closed) return;
          await sleep(pendingDelay);
          if (closed) return;
          try {
            current = await args.open(onActivity);
          } catch (err) {
            if (isFatalStreamError(err)) throw err;
            pendingReason = reasonOf(err);
            pendingDelay = reconnectDelayMs(err, ++attempt);
            continue;
          }
          if (closed) {
            await current.close().catch(() => undefined);
            return;
          }
        }

        const conn = current;
        const it = conn.events[Symbol.asyncIterator]();
        let hint: number | null = null;
        let failure: unknown = null;
        let reason = 'ended';
        try {
          while (!closed) {
            const r = await nextWithWatchdog(it, conn);
            if (r.done) break;
            const ev = r.value;
            if (ev.kind === 'close') {
              reason = typeof ev.data['reason'] === 'string' ? ev.data['reason'] : 'close';
              const ms = Number(ev.data['retryAfterMs']);
              hint = Number.isFinite(ms) && ms >= 0 ? Math.min(ms, MAX_HINT_MS) : null;
              break;
            }
            const mapped = args.map(ev);
            if (args.isTerminal?.(ev)) {
              if (mapped !== null) yield mapped;
              closed = true;
              return;
            }
            if (ev.kind === 'ready') {
              if (mapped !== null) yield mapped;
              if (args.catchUp) {
                for await (const c of args.catchUp(mapped, !firstConnect)) {
                  if (closed) return;
                  if (!args.accept || args.accept(c)) yield c;
                }
              }
              firstConnect = false;
              attempt = 0;
              yield { kind: 'connection', state: 'connected' };
              continue;
            }
            if (mapped !== null && (!args.accept || args.accept(mapped))) yield mapped;
          }
        } catch (err) {
          if (closed) return;
          if (isFatalStreamError(err)) throw err;
          failure = err;
          reason = err instanceof HeartbeatTimeout ? 'heartbeat_timeout' : reasonOf(err);
        } finally {
          if (current === conn) current = null;
          await conn.close().catch(() => undefined);
        }
        if (closed) return;
        pendingReason = reason;
        // A server `close` is planned (scale-in, rebalance): its hint is the
        // whole wait and it doesn't count as a failed attempt.
        pendingDelay = hint ?? reconnectDelayMs(failure, ++attempt);
      }
    } finally {
      closed = true;
      wake?.();
      if (current) await current.close().catch(() => undefined);
    }
  }

  return {
    events: iterate(),
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      activity = null;
      wake?.();
      const c = current;
      current = null;
      if (c) await c.close().catch(() => undefined);
    },
  };
}

function reasonOf(err: unknown): string {
  if (err instanceof KratyApiError && err.status === 503) return 'busy';
  return 'error';
}
