import { KratyApiError, KratyNetworkError, type KratyErrorPayload } from './errors.js';
import {
  InMemorySecretStore,
  LocalStorageSecretStore,
  type SecretStore,
} from './secret-store.js';
import {
  FinalizationTracker,
  InMemoryMembershipStore,
  LocalStorageMembershipStore,
  StandingKind,
  type FinalizationListener,
  type FinalizationResult,
  type FinalizationReason,
  type FinalStanding,
  type MembershipRef,
  type MembershipStore,
} from './finalization.js';

/**
 * SDK name + version, sent as `X-Kraty-SDK: <name>/<version>` on
 * every request. Lets the backend tell which SDK + version sent a
 * given request, useful for debugging (an old SDK in the wild
 * hitting a new backend) and for graceful deprecation handling.
 *
 * Bump in lockstep with package.json `version`. The OpenAPI parity
 * check doesn't enforce this (it's a manual coupling) but the
 * value is stable enough that a stale const here is a minor bug,
 * not a contract break.
 */
const SDK_NAME = '@kraty/sdk';
const SDK_VERSION = '0.19.0';
const SDK_USER_AGENT = `${SDK_NAME}/${SDK_VERSION}`;

/**
 * Options the consumer passes to `new KratyClient({ ... })`.
 */
export interface KratyClientOptions {
  /** API key in the `{prefix}.{secret}` form returned by the portal. */
  apiKey: string;
  /**
   * Per-player secret. When set, the client attaches
   * `X-Player-Secret: <value>` to every request. Required by all
   * player-scoped routes (`events.start`, `events.progress`,
   * `grants.*`, `inventory.*`, `wallet.*`); without it those return
   * 401 `player_secret_invalid`. Use `Kraty.connectAsPlayer` to
   * bootstrap this instead of wiring it by hand.
   */
  playerSecret?: string;
  /**
   * The `externalPlayerId` this SDK instance is authenticated as.
   * When set, player-scoped methods default to this id and skip
   * auto-register on first call. Leave unset for self-serve
   * signups; the SDK then auto-generates a UUID on first use
   * and persists it in [secretStore].
   */
  activeExternalPlayerId?: string;
  /**
   * Persistence backend for the player secret + active id. When
   * omitted, the SDK picks a sensible default:
   *
   *   - In a browser / React Native runtime where
   *     `globalThis.localStorage` exists → `LocalStorageSecretStore`.
   *   - In Node, server-rendered web, or workers → an in-memory
   *     store. Wire your own (Keychain, encrypted storage,
   *     session table on your backend, …) if you need durability.
   *
   * Most game clients never need to touch this; the default does
   * the right thing on every platform the SDK ships on.
   */
  secretStore?: SecretStore;

  /**
   * Persists the finalization catch-up registry (docs/05b): the boards the
   * player is in, so `checkFinalizations()` can report ones that ended while
   * they were away. Defaults to `localStorage` when available, else in-memory
   * (catch-up then only spans the current process). Wire your own for
   * native storage.
   */
  membershipStore?: MembershipStore;
  /** Override only for testing / staging. Production clients always hit the default. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 10s. */
  timeoutMs?: number;
  /**
   * Retry configuration. `attempts` is the TOTAL number of HTTP calls
   * (1 = no retry). Defaults to 4 with exponential backoff starting at
   * 100ms. Retries fire on network errors, 429, and 5xx.
   */
  retry?: Partial<RetryConfig>;
  /**
   * Custom fetch impl. Tests inject a mock; consumers can route through
   * their own pipeline (auth proxy, observability wrapper, etc.).
   * Defaults to `globalThis.fetch`.
   */
  fetch?: typeof fetch;
  /**
   * Optional idempotency-key generator. Defaults to `crypto.randomUUID()`.
   * Tests inject a deterministic counter so log/replay assertions don't
   * depend on UUID format.
   */
  generateIdempotencyKey?: () => string;
  /** Hook fired after every request; useful for telemetry. */
  onRequest?: (info: RequestInfo) => void;
}

export interface RetryConfig {
  attempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  /**
   * Optional jitter factor (0–1). Each backoff is multiplied by
   * `1 + (random() * 2 - 1) * jitter` so multiple SDKs retrying
   * against the same downed endpoint don't thunder. Default 0.2.
   */
  jitter: number;
}

export interface RequestInfo {
  method: string;
  url: string;
  attempt: number;
  idempotencyKey: string | null;
  durationMs?: number;
  status?: number;
  ok?: boolean;
}

const DEFAULT_RETRY: RetryConfig = {
  attempts: 4,
  initialDelayMs: 100,
  maxDelayMs: 5_000,
  jitter: 0.2,
};

const DEFAULT_BASE_URL = 'https://api.kraty.io';

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * HTTP methods that the SDK auto-stamps with an `idempotencyKey` when
 * the body doesn't already include one. `GET` is naturally idempotent
 * so the header isn't added.
 */
const IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * The base HTTP client. Resource clients (`EventsClient`,
 * `LeaderboardsClient`, ...) compose over it; consumers typically
 * instantiate the per-resource wrappers via the convenience
 * `Kraty` facade.
 */
/** Server clock, returned by {@link KratyClient.getServerTime}. */
export interface ServerTime {
  /** Unix epoch milliseconds (UTC). Compare this against event `endsAt`. */
  epochMs: number;
  /** UTC ISO-8601 string. */
  iso: string;
  /** IANA timezone the `local`/`offsetMinutes` fields describe (`UTC` unless a
   *  `timezone` was requested). */
  timezone: string;
  /** `timezone`'s offset from UTC at this instant, in minutes. */
  offsetMinutes: number;
  /** Wall-clock in `timezone`, ISO-like without a zone (`YYYY-MM-DDTHH:mm:ss`).
   *  Display only — always compare with `epochMs`. */
  local: string;
}

/** Monotonic milliseconds, immune to device wall-clock changes. Falls back to
 *  Date.now() only where `performance` is unavailable (then it isn't tamper-
 *  proof, but that's vanishingly rare on supported runtimes). */
function monotonicNowMs(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
}

export class KratyClient {
  private readonly _baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retry: RetryConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly _authHeader: string;
  // Identity is mutable on purpose: the lazy `ensureIdentity()`
  // call may register or restore a player after construction and
  // mutate these in place so subsequent calls skip the round-trip.
  private _playerSecret: string | null;
  private _activeExternalPlayerId: string | null;
  // The fake name + avatar the backend mints on register. Populated on the
  // register path of ensureIdentity / connectAsPlayer; null until then.
  private _syntheticIdentity: { name: string; avatar?: string | null } | null = null;
  private readonly _secretStore: SecretStore;
  private readonly _finalization: FinalizationTracker;
  private readonly generateIdempotencyKey: () => string;
  private readonly onRequest?: (info: RequestInfo) => void;
  // Inflight register dedupe: concurrent first-touch calls on a
  // freshly-constructed client share the same registration so we
  // don't fire two POST /register against the server.
  private _identityInit: Promise<{ externalPlayerId: string; secret: string }> | null = null;
  // Server-clock anchor (see syncTime): the server epoch captured at sync +
  // the MONOTONIC reading at that instant, so serverNow() advances immune to
  // the device wall-clock being changed.
  private _timeAnchor: { serverMs: number; monoMs: number } | null = null;

  constructor(opts: KratyClientOptions) {
    if (!opts.apiKey || typeof opts.apiKey !== 'string') {
      throw new TypeError('KratyClient: apiKey is required');
    }
    this._baseUrl = stripTrailingSlash(opts.baseUrl ?? DEFAULT_BASE_URL);
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.retry = { ...DEFAULT_RETRY, ...(opts.retry ?? {}) };
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new TypeError(
        'KratyClient: no fetch implementation available. Pass `fetch` in options or run on Node 18+ / a modern runtime',
      );
    }
    this._authHeader = `Bearer ${opts.apiKey}`;
    this._playerSecret = opts.playerSecret && opts.playerSecret.length > 0 ? opts.playerSecret : null;
    this._activeExternalPlayerId =
      opts.activeExternalPlayerId && opts.activeExternalPlayerId.length > 0
        ? opts.activeExternalPlayerId
        : null;
    this._secretStore = opts.secretStore ?? defaultSecretStore();
    this.generateIdempotencyKey = opts.generateIdempotencyKey ?? defaultIdempotencyKey;
    if (opts.onRequest) this.onRequest = opts.onRequest;
    this._finalization = new FinalizationTracker({
      store: opts.membershipStore ?? defaultMembershipStore(),
      // Never force-register during catch-up: only the current active player.
      getActivePlayerId: async () => this._activeExternalPlayerId,
      readEventLeaderboard: async (leaderboardId) => {
        const ext = this._activeExternalPlayerId;
        if (!ext) return null;
        // Pull the top rows (not just self) so a finalization can be rendered
        // straight from the result — each row already carries server-resolved
        // `avatar` + `isSelf`, so the app doesn't re-fetch or match ids.
        const params = new URLSearchParams({ includeSelf: 'true', externalId: ext, limit: '50' });
        try {
          const env = await this.request<{
            data: {
              finalized: boolean;
              finalizedReason: FinalizationReason | null;
              self: { rank: number; score: number } | null;
              entries?: Array<{
                participantId: string;
                rank: number;
                score: number;
                name?: string | null;
                kind: 'player' | 'bot';
                avatar?: string | null;
                isSelf?: boolean;
              }>;
            };
          }>('GET', `/sdk/v1/event-leaderboards/${encodeURIComponent(leaderboardId)}?${params.toString()}`);
          const standings: FinalStanding[] = (env.data.entries ?? []).map((e) => ({
            participantId: e.participantId,
            rank: e.rank,
            score: e.score,
            name: e.name ?? '',
            kind: e.kind === 'bot' ? StandingKind.Bot : StandingKind.Player,
            avatar: e.avatar ?? null,
            isSelf: e.isSelf ?? false,
          }));
          return {
            finalized: env.data.finalized,
            reason: env.data.finalizedReason,
            self: env.data.self,
            standings,
          };
        } catch {
          return null; // unreadable → treat as still-active
        }
      },
    });
  }

  // ── Finalization catch-up (docs/05b) ──────────────────────────────
  // Public on the `Kraty` facade; resource clients reach the internal
  // track/route hooks via `this.client`.

  /** Register a handler for board finalizations (live SSE + catch-up). */
  onFinalized(cb: FinalizationListener): () => void {
    return this._finalization.onFinalized(cb);
  }
  /** Poll tracked boards; report + return any that finalized while away. */
  checkFinalizations(): Promise<FinalizationResult[]> {
    return this._finalization.checkFinalizations();
  }
  /** Acknowledge a handled finalization; drops it from the registry. */
  dismiss(ref: MembershipRef): Promise<void> {
    return this._finalization.dismiss(ref);
  }
  /** Bulk-drop every already-reported membership. Returns the count. */
  clearReported(): Promise<number> {
    return this._finalization.clearReported();
  }
  /** @internal. Resource clients record a joined board. */
  trackMembership(ref: MembershipRef, label?: string): Promise<void> {
    return this._finalization.track(ref, label);
  }
  /** @internal. The subscribe loop routes a live `finalized` event here. */
  routeFinalized(
    leaderboardId: string,
    data: { reason?: string; standings?: FinalizationResult['standings']; eventId?: string },
  ): Promise<void> {
    return this._finalization.onStreamFinalized(leaderboardId, data);
  }

  // ── Server clock ──────────────────────────────────────────────────
  // A trustworthy time source: fetch the server's clock so game timers
  // (event countdowns, etc.) can't be cheated by changing the device clock.

  /**
   * Fetch the server's current time. `epochMs` (UTC) is the value to compare
   * against event `endsAt`. Pass `timezone` (an IANA name, e.g.
   * `'Europe/Lisbon'`) to also receive that zone's wall-clock (`local`) +
   * `offsetMinutes` for display — comparisons should still use `epochMs`.
   */
  async getServerTime(opts?: { timezone?: string }): Promise<ServerTime> {
    const qs = opts?.timezone ? `?timezone=${encodeURIComponent(opts.timezone)}` : '';
    const env = await this.request<{ data: ServerTime }>('GET', `/sdk/v1/time${qs}`);
    return env.data;
  }

  /**
   * Anchor a tamper-proof clock: fetch the server time once and pin it to a
   * MONOTONIC reference (`performance.now()`), so {@link serverNow} keeps
   * ticking correctly even if the player changes their device clock afterwards.
   * Call at startup and again on app resume. Network latency introduces at most
   * a sub-second skew, which is negligible for event timers.
   */
  async syncTime(): Promise<void> {
    const t = await this.getServerTime();
    this._timeAnchor = { serverMs: t.epochMs, monoMs: monotonicNowMs() };
  }

  /** True once {@link syncTime} has succeeded at least once. */
  get isTimeSynced(): boolean {
    return this._timeAnchor !== null;
  }

  /**
   * Current server time as Unix epoch ms (UTC), derived from the last
   * {@link syncTime} anchor + monotonic elapsed — safe against device-clock
   * tampering. Throws if {@link syncTime} hasn't run yet.
   */
  serverNowMs(): number {
    if (!this._timeAnchor) {
      throw new Error('kraty: call syncTime() before serverNow()/serverNowMs()');
    }
    return this._timeAnchor.serverMs + (monotonicNowMs() - this._timeAnchor.monoMs);
  }

  /** {@link serverNowMs} as a `Date`. */
  serverNow(): Date {
    return new Date(this.serverNowMs());
  }

  // ── Accessors for the SSE leaderboard stream ──────────────────────
  // These let LeaderboardStream re-use the configured auth / base url
  // without widening the public API. Internal-by-convention.

  /** @internal */
  get baseUrl(): string { return this._baseUrl; }
  /** @internal */
  get authHeader(): string { return this._authHeader; }
  /** @internal */
  get playerSecret(): string | null { return this._playerSecret; }
  /**
   * The active player this client is authenticated as. Resource
   * clients fall back to this value when the caller omits the
   * `externalId` argument on a player-scoped method. Returns
   * null until `ensureIdentity()` has run at least once.
   */
  get activeExternalPlayerId(): string | null { return this._activeExternalPlayerId; }
  /**
   * The player's generated fake identity (name + avatar), if one has been
   * resolved via register/connect. Null on resumed sessions where the client
   * restored a stored secret without re-registering. See PlayerRegistration.
   */
  get syntheticIdentity(): { name: string; avatar?: string | null } | null {
    return this._syntheticIdentity;
  }
  /** @internal. Seeded by `Kraty.connectAsPlayer` after a register round-trip. */
  setSyntheticIdentity(v: { name: string; avatar?: string | null } | null): void {
    this._syntheticIdentity = v;
  }
  /** @internal */
  get fetchForStreaming(): typeof fetch { return this.fetchImpl; }
  /** @internal */
  get sdkUserAgent(): string { return SDK_USER_AGENT; }
  /** @internal */
  get secretStore(): SecretStore { return this._secretStore; }

  /**
   * Resolve the active player, registering a fresh one if none
   * exists. Called transparently by every player-scoped resource
   * method, so game code rarely needs to invoke this directly.
   *
   * Resolution order:
   *  1. Constructor `activeExternalPlayerId` (with secret if also
   *     supplied); explicit, no I/O needed.
   *  2. SecretStore's persisted active id + matching secret: the
   *     "resume previous session" path.
   *  3. Fresh self-serve signup: generate a UUID, POST
   *     /sdk/v1/players/:id/register, persist the secret, install
   *     it on the client.
   *
   * Concurrent first-touch calls share one inflight promise so
   * we don't double-register.
   */
  async ensureIdentity(): Promise<{ externalPlayerId: string; secret: string }> {
    if (this._activeExternalPlayerId && this._playerSecret) {
      return {
        externalPlayerId: this._activeExternalPlayerId,
        secret: this._playerSecret,
      };
    }
    if (this._identityInit) return this._identityInit;
    this._identityInit = (async () => {
      // Path 2: try the persisted active id first.
      const storedActive = await (this._secretStore.readActiveExternalPlayerId?.() ?? Promise.resolve(null));
      const explicitActive = this._activeExternalPlayerId;
      const candidate = explicitActive ?? storedActive ?? null;
      if (candidate) {
        const secret = await this._secretStore.read(candidate);
        if (secret && secret.length > 0) {
          this._activeExternalPlayerId = candidate;
          this._playerSecret = secret;
          await this._secretStore.writeActiveExternalPlayerId?.(candidate);
          return { externalPlayerId: candidate, secret };
        }
      }
      // Path 3: fresh signup. Generate a UUID; if the dev supplied
      // a constructor `activeExternalPlayerId` we use that instead.
      const newId = explicitActive ?? generateExternalPlayerId();
      const res = await this.request<{
        data: { secret: string; syntheticIdentity?: { name: string; avatar?: string | null } | null };
      }>('POST', `/sdk/v1/players/${encodeURIComponent(newId)}/register`, {});
      const secret = res.data.secret;
      this._syntheticIdentity = res.data.syntheticIdentity ?? null;
      await this._secretStore.write(newId, secret);
      await this._secretStore.writeActiveExternalPlayerId?.(newId);
      this._activeExternalPlayerId = newId;
      this._playerSecret = secret;
      return { externalPlayerId: newId, secret };
    })();
    try {
      return await this._identityInit;
    } finally {
      // Don't cache the promise once it's resolved; the next call
      // takes the fast path through the field check at the top.
      this._identityInit = null;
    }
  }

  /**
   * Forget the persisted identity (secret + active id). The next
   * player-scoped call triggers a fresh `ensureIdentity()` and
   * either resumes from a different stored id or registers a new
   * player. Use this on "switch user" / "sign out" flows.
   */
  async logout(): Promise<void> {
    const id = this._activeExternalPlayerId;
    if (id) {
      try { await this._secretStore.remove(id); } catch { /* best-effort */ }
    }
    await (this._secretStore.clearActiveExternalPlayerId?.() ?? Promise.resolve());
    this._activeExternalPlayerId = null;
    this._playerSecret = null;
  }

  /**
   * Install an explicit identity on this client (and persist it
   * via the SecretStore so subsequent launches resume to it).
   * Use when a player signs in via your own auth on a new device
   * and you've fetched their secret out of your own backend.
   */
  async signIn(identity: {
    externalPlayerId: string;
    secret: string;
  }): Promise<void> {
    await this._secretStore.write(identity.externalPlayerId, identity.secret);
    await this._secretStore.writeActiveExternalPlayerId?.(identity.externalPlayerId);
    this._activeExternalPlayerId = identity.externalPlayerId;
    this._playerSecret = identity.secret;
  }

  /**
   * Low-level: fire a JSON request against the SDK surface. Resource
   * clients call this; consumers usually go through the resource
   * wrappers instead.
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    init?: { idempotencyKey?: string },
  ): Promise<T> {
    const url = `${this._baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const upperMethod = method.toUpperCase();
    const idempotencyKey = this.resolveIdempotencyKey(upperMethod, body, init?.idempotencyKey);
    const requestBody = this.attachIdempotencyKey(body, idempotencyKey);

    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.retry.attempts; attempt++) {
      const start = Date.now();
      try {
        const res = await this.fireOnce(upperMethod, url, requestBody);
        const info: RequestInfo = {
          method: upperMethod,
          url,
          attempt,
          idempotencyKey,
          durationMs: Date.now() - start,
          status: res.status,
          ok: res.ok,
        };
        this.onRequest?.(info);

        if (res.ok) {
          const body = (await parseJson(res)) as unknown;
          // The backend uses 202 + `{ error: { code, message } }` to
          // signal "valid request, but not ready yet"; currently
          // only `lobby_forming`. Treat any 2xx response carrying an
          // error envelope as an API error so SDK consumers can
          // `switch (err.code)` consistently across status codes.
          if (
            body &&
            typeof body === 'object' &&
            'error' in (body as object) &&
            (body as { error?: KratyErrorPayload }).error?.code
          ) {
            const env = (body as { error: KratyErrorPayload }).error;
            throw new KratyApiError(res.status, env.code, env.message, env.details);
          }
          return body as T;
        }
        const apiErr = await asApiError(res);
        if (RETRYABLE_STATUSES.has(res.status) && attempt < this.retry.attempts) {
          await this.sleepBackoff(attempt, res);
          lastErr = apiErr;
          continue;
        }
        throw apiErr;
      } catch (err) {
        if (err instanceof KratyApiError) throw err;
        // Network / abort / fetch crash.
        const wrapped =
          err instanceof KratyNetworkError
            ? err
            : new KratyNetworkError(
                err instanceof Error ? err.message : 'fetch failed',
                err,
              );
        this.onRequest?.({
          method: upperMethod,
          url,
          attempt,
          idempotencyKey,
          durationMs: Date.now() - start,
          ok: false,
        });
        if (attempt < this.retry.attempts) {
          await this.sleepBackoff(attempt);
          lastErr = wrapped;
          continue;
        }
        throw wrapped;
      }
    }
    // Shouldn't be reachable (the loop always returns or throws) but
    // appease the typechecker.
    throw lastErr instanceof Error ? lastErr : new KratyNetworkError('exhausted retries');
  }

  private async fireOnce(
    method: string,
    url: string,
    body: unknown,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        method,
        headers: {
          authorization: this._authHeader,
          accept: 'application/json',
          'x-kraty-sdk': SDK_USER_AGENT,
          ...(this._playerSecret ? { 'x-player-secret': this._playerSecret } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveIdempotencyKey(
    method: string,
    body: unknown,
    explicit: string | undefined,
  ): string | null {
    if (explicit) return explicit;
    if (!IDEMPOTENT_METHODS.has(method)) return null;
    if (body && typeof body === 'object' && 'idempotencyKey' in (body as object)) {
      const v = (body as { idempotencyKey?: unknown }).idempotencyKey;
      if (typeof v === 'string' && v.length > 0) return v;
    }
    return this.generateIdempotencyKey();
  }

  private attachIdempotencyKey(body: unknown, key: string | null): unknown {
    if (key === null) return body;
    if (body === undefined || body === null) return { idempotencyKey: key };
    if (typeof body !== 'object') return body;
    if ('idempotencyKey' in (body as object)) return body;
    return { ...(body as object), idempotencyKey: key };
  }

  private async sleepBackoff(attempt: number, res?: Response): Promise<void> {
    // Honor Retry-After when the server sends one (429s in particular).
    const retryAfter = res?.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) {
        await sleep(Math.min(seconds * 1000, this.retry.maxDelayMs));
        return;
      }
    }
    const base = Math.min(
      this.retry.initialDelayMs * 2 ** (attempt - 1),
      this.retry.maxDelayMs,
    );
    const jittered = base * (1 + (Math.random() * 2 - 1) * this.retry.jitter);
    await sleep(Math.max(0, jittered));
  }
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function defaultIdempotencyKey(): string {
  // `crypto.randomUUID` is available on Node 18+ and every modern
  // browser / runtime that ships the WebCrypto API. Cast through
  // `globalThis` so the SDK doesn't carry a Node typings dependency.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback: a 16-byte hex string. Not RFC-4122 v4, but unique enough.
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseJson(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new KratyApiError(
      res.status,
      'internal_error',
      `response body was not valid JSON: ${text.slice(0, 200)}`,
    );
  }
}

/**
 * Pick a SecretStore for the runtime when the consumer doesn't
 * supply one. Browser + React Native both expose
 * `globalThis.localStorage`; everything else falls back to an
 * in-memory store with a warning behaviour (in-process state is
 * not durable across launches, so a Node-based consumer that
 * actually wants persistence should plug in their own).
 */
interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultSecretStore(): SecretStore {
  const ls = (globalThis as { localStorage?: WebStorageLike }).localStorage;
  // Pick localStorage only when it actually exposes the expected
  // surface. Some test environments (Node + happy-dom misconfigured)
  // define a stub object that throws on use; falling back to the
  // in-memory store keeps unit tests boring instead of crashing.
  if (
    ls &&
    typeof ls.getItem === 'function' &&
    typeof ls.setItem === 'function' &&
    typeof ls.removeItem === 'function'
  ) {
    return new LocalStorageSecretStore(ls);
  }
  return new InMemorySecretStore();
}

/** Same runtime pick as {@link defaultSecretStore}, for the membership
 *  registry: localStorage when present, else in-memory. */
function defaultMembershipStore(): MembershipStore {
  const ls = (globalThis as { localStorage?: WebStorageLike }).localStorage;
  if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') {
    return new LocalStorageMembershipStore(ls);
  }
  return new InMemoryMembershipStore();
}

/**
 * Generate a self-serve `externalPlayerId` for a fresh signup.
 * Prefixed so a glance at the audit log distinguishes
 * SDK-minted ids from your own (which typically come from your
 * authentication backend). UUID v4 under the hood, so collision
 * resistance is good enough for the lifetime of a single device.
 */
function generateExternalPlayerId(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : // Tiny fallback for ancient runtimes that don't have
        // crypto.randomUUID. Not cryptographically strong on its
        // own; we rely on the per-player secret for security,
        // not on the id being unguessable.
        Array.from({ length: 32 }, () =>
          Math.floor(Math.random() * 16).toString(16),
        ).join('');
  return `kp_${uuid.replace(/-/g, '')}`;
}

async function asApiError(res: Response): Promise<KratyApiError> {
  const text = await res.text();
  let payload: { error?: KratyErrorPayload } | undefined;
  try {
    payload = text ? (JSON.parse(text) as { error?: KratyErrorPayload }) : undefined;
  } catch {
    /* swallow, fall through to a synthesized error */
  }
  const err = payload?.error;
  if (err) {
    return new KratyApiError(res.status, err.code, err.message, err.details);
  }
  return new KratyApiError(
    res.status,
    'internal_error',
    `non-2xx response without an error envelope (status=${res.status})`,
  );
}
