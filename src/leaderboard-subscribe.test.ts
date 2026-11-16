import { describe, expect, it } from 'vitest';
import { Kraty } from './index.js';

/**
 * EventLeaderboardsClient.subscribe: a `close()` that lands while the SSE
 * stream is still connecting must still tear the connection down once it
 * opens. Before the fix the late stream stayed open forever; browsers cap
 * connections per host, so a few of these (React StrictMode mounts every
 * subscriber twice) starved every other request.
 */
describe('EventLeaderboardsClient.subscribe', () => {
  it('closes a stream that finishes connecting after close()', async () => {
    let releaseConnect!: () => void;
    const connectGate = new Promise<void>((r) => (releaseConnect = r));
    let streamSignal: AbortSignal | undefined;

    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      streamSignal = init?.signal ?? undefined;
      await connectGate;
      // A live SSE body that never ends on its own.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.close());
        },
      });
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }) as unknown as typeof fetch;

    const kraty = new Kraty({
      apiKey: 'pUUVdrM8.djr4-0Iv9h1JvVNSMZNDmSsSN7lSVq2F9dG6DG4A5uQ',
      baseUrl: 'https://api.test.kraty.io',
      fetch: fetchImpl,
      playerSecret: 'sekret',
      activeExternalPlayerId: 'alice',
      retry: { attempts: 1, initialDelayMs: 1, maxDelayMs: 5, jitter: 0 },
    });

    const sub = kraty.eventLeaderboards.subscribe('lb-1', () => undefined, { pollIntervalMs: 0 });
    await sub.close(); // before the stream has connected
    releaseConnect();

    await expect.poll(() => streamSignal?.aborted).toBe(true);
  });
});
