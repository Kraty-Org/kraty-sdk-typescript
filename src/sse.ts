import { KratyApiError, KratyNetworkError, type KratyErrorPayload } from './errors.js';

/**
 * Minimal Server-Sent Events reader shared by every Kraty stream
 * (leaderboards, inventory). Parses the `event:` / `data:` line protocol
 * off a `fetch` response body and yields one object per event.
 *
 * No auto-reconnect on purpose: resumption policy differs per stream and
 * per game (backoff, whether to re-read state first), so the SDK surfaces
 * the transport error and lets the caller decide.
 */

/** One parsed SSE event: the `event:` name plus the decoded `data:` JSON. */
export interface SseEvent {
  kind: string;
  data: Record<string, unknown>;
}

/** Handle to an open SSE subscription. */
export interface SseStream {
  /** Async iterable of server-pushed events. Throws on transport drop. */
  events: AsyncIterable<SseEvent>;
  /** Cancels the subscription + closes the HTTP stream. Idempotent. */
  close(): Promise<void>;
}

export interface OpenSseArgs {
  fetchImpl: typeof fetch;
  url: string;
  authHeader: string;
  playerSecret: string | null;
  sdkUserAgent: string;
  /** Prefix for transport error messages, e.g. `"leaderboard stream"`. */
  label: string;
}

export async function openSseStream(args: OpenSseArgs): Promise<SseStream> {
  const controller = new AbortController();

  let response: Response;
  try {
    response = await args.fetchImpl(args.url, {
      method: 'GET',
      headers: {
        authorization: args.authHeader,
        accept: 'text/event-stream',
        'x-kraty-sdk': args.sdkUserAgent,
        ...(args.playerSecret ? { 'x-player-secret': args.playerSecret } : {}),
      },
      signal: controller.signal,
    });
  } catch (err) {
    throw new KratyNetworkError(
      `${args.label} connect failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let payload: { error?: KratyErrorPayload } | undefined;
    try {
      payload = text ? (JSON.parse(text) as { error?: KratyErrorPayload }) : undefined;
    } catch {
      /* not JSON; fall through */
    }
    throw new KratyApiError(
      response.status,
      payload?.error?.code ?? `http_${response.status}`,
      payload?.error?.message ?? text,
      payload?.error?.details,
    );
  }

  if (!response.body) {
    throw new KratyNetworkError(`${args.label}: response has no body stream`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let closed = false;

  async function* iterate(): AsyncGenerator<SseEvent, void, unknown> {
    let currentEvent = 'message';
    let dataBuffer = '';

    const flushEvent = (): SseEvent | null => {
      if (dataBuffer.length === 0) {
        currentEvent = 'message';
        return null;
      }
      let parsed: Record<string, unknown>;
      try {
        const j: unknown = JSON.parse(dataBuffer);
        parsed =
          j && typeof j === 'object' && !Array.isArray(j)
            ? (j as Record<string, unknown>)
            : { value: j };
      } catch {
        // Parse error: surface as an event with kind="parse-error"
        // so consumers can decide whether to bail or keep listening.
        parsed = { raw: dataBuffer };
        const ev: SseEvent = { kind: 'parse-error', data: parsed };
        dataBuffer = '';
        currentEvent = 'message';
        return ev;
      }
      const ev: SseEvent = { kind: currentEvent, data: parsed };
      dataBuffer = '';
      currentEvent = 'message';
      return ev;
    };

    const processLine = (line: string): SseEvent | null => {
      if (line.length === 0) {
        // Blank line terminates an event.
        return flushEvent();
      }
      if (line.startsWith(':')) {
        // Comment / heartbeat: ignore.
        return null;
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) return null;
      const field = line.slice(0, colonIdx);
      let value = line.slice(colonIdx + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      switch (field) {
        case 'event':
          currentEvent = value;
          break;
        case 'data':
          if (dataBuffer.length > 0) dataBuffer += '\n';
          dataBuffer += value;
          break;
        // SSE also defines `id` and `retry`, which we don't use.
        default:
          break;
      }
      return null;
    };

    try {
      while (true) {
        if (closed) return;
        const { value, done } = await reader.read();
        if (done) {
          // Server closed the stream; flush any final event.
          const tail = flushEvent();
          if (tail) yield tail;
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          // SSE uses LF or CRLF; trim a trailing CR.
          let line = buffer.slice(0, newlineIdx);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          buffer = buffer.slice(newlineIdx + 1);
          const ev = processLine(line);
          if (ev) yield ev;
        }
      }
    } catch (err) {
      if (closed) return;
      if (err instanceof KratyApiError || err instanceof KratyNetworkError) throw err;
      throw new KratyNetworkError(
        `${args.label} read failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  return {
    events: iterate(),
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        controller.abort();
      } catch {
        /* swallow */
      }
      try {
        await reader.cancel();
      } catch {
        /* swallow */
      }
    },
  };
}
