import { describe, expect, it } from 'vitest';
import type { LeaderboardStreamEvent } from './index.js';
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

  it('reconnects after a server close, and stops for good after closed', async () => {
    const bodies = [
      'event: ready\ndata: {"leaderboardId":"lb-1","finalized":false}\n\n'
        + 'event: score_update\ndata: {"participantId":"p1","score":5}\n\n'
        + 'event: close\ndata: {"reason":"shutdown","retryAfterMs":10}\n\n',
      'event: ready\ndata: {"leaderboardId":"lb-1","finalized":false}\n\n'
        + 'event: score_update\ndata: {"participantId":"p1","score":7}\n\n'
        + 'event: closed\ndata: {"reason":"finalized"}\n\n',
    ];
    let opened = 0;
    const fetchImpl = (async () => {
      const body = bodies[opened++];
      if (!body) throw new Error('reconnected after closed');
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }) as unknown as typeof fetch;
    const kraty = new Kraty({
      apiKey: 'pUUVdrM8.djr4-0Iv9h1JvVNSMZNDmSsSN7lSVq2F9dG6DG4A5uQ',
      baseUrl: 'https://api.test.kraty.io',
      fetch: fetchImpl,
      playerSecret: 'sekret',
      activeExternalPlayerId: 'alice',
      retry: { attempts: 1, initialDelayMs: 1, maxDelayMs: 5, jitter: 0 },
    });
    const seen: string[] = [];
    const errors: unknown[] = [];
    const sub = kraty.eventLeaderboards.subscribe(
      'lb-1',
      (ev: LeaderboardStreamEvent) => seen.push(ev.kind === 'connection' ? `connection:${String(ev.data['state'])}` : ev.kind),
      { pollIntervalMs: 0, onError: (e) => errors.push(e) },
    );
    await expect.poll(() => seen.includes('closed')).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    await sub.close();
    expect(seen).toEqual([
      'ready', 'connection:connected', 'score_update',
      'connection:reconnecting',
      'ready', 'connection:connected', 'score_update', 'closed',
    ]);
    expect(opened).toBe(2);
    expect(errors).toEqual([]);
  });
});

describe('InventoryClient.watch', () => {
  it('reconnects after a drop and reports it as connection events', async () => {
    const bodies = [
      'event: ready\ndata: {"externalPlayerId":"alice"}\n\n'
        + 'event: inventory_changed\ndata: {"itemKey":"gem","delta":1,"quantity":1,"origin":"server"}\n\n'
        + 'event: close\ndata: {"reason":"rebalance","retryAfterMs":5}\n\n',
      'event: ready\ndata: {"externalPlayerId":"alice"}\n\n'
        + 'event: wallet_changed\ndata: {"economyKey":"coins","delta":5,"balance":5,"origin":"admin"}\n\n',
    ];
    let opened = 0;
    const fetchImpl = (async () => {
      const body = bodies[opened++];
      // Third connect: hang until aborted by stop().
      if (!body) return new Response(new ReadableStream(), { status: 200 });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }) as unknown as typeof fetch;
    const kraty = new Kraty({
      apiKey: 'pUUVdrM8.djr4-0Iv9h1JvVNSMZNDmSsSN7lSVq2F9dG6DG4A5uQ',
      baseUrl: 'https://api.test.kraty.io',
      fetch: fetchImpl,
      playerSecret: 'sekret',
      activeExternalPlayerId: 'alice',
    });
    const seen: string[] = [];
    const stop = await kraty.inventory.watch((ev) => seen.push(ev.kind === 'connection' ? `connection:${ev.state}` : ev.kind));
    await expect.poll(() => seen.includes('wallet_changed')).toBe(true);
    await stop();
    expect(seen.slice(0, 7)).toEqual([
      'ready', 'connection:connected', 'inventory_changed',
      'connection:reconnecting',
      'ready', 'connection:connected', 'wallet_changed',
    ]);
  });
});
