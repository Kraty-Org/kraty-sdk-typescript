import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kraty } from './index.js';

/**
 * FriendsClient: URL / method / body shaping and `{ data }` unwrapping
 * for the social-graph surface. Fake-fetch style mirrors
 * player-auth.test.ts.
 */

interface FakeCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function makeFetch(responses: Array<() => Response | Promise<Response>>) {
  const calls: FakeCall[] = [];
  let i = 0;
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>),
      ),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const factory = responses[i++];
    if (!factory) throw new Error(`fake fetch exhausted; got call ${i}`);
    return await factory();
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const baseOpts = (fetchImpl: typeof fetch) => ({
  apiKey: 'pUUVdrM8.djr4-0Iv9h1JvVNSMZNDmSsSN7lSVq2F9dG6DG4A5uQ',
  baseUrl: 'https://api.test.kraty.io',
  fetch: fetchImpl,
  playerSecret: 'sekret',
  activeExternalPlayerId: 'alice',
  generateIdempotencyKey: () => 'idem-1',
  retry: { attempts: 1, initialDelayMs: 1, maxDelayMs: 5, jitter: 0 },
  timeoutMs: 1_000,
});

afterEach(() => vi.restoreAllMocks());

describe('FriendsClient', () => {
  it('getCode GETs /friend-code and returns the code', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { friendCode: 'K7P2QX', displayIdentity: null } }),
    ]);
    const k = new Kraty(baseOpts(fetch));
    const res = await k.friends.getCode();
    expect(res.friendCode).toBe('K7P2QX');
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toContain('/sdk/v1/players/alice/friend-code');
  });

  it('heartbeat POSTs presence with the status body', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { online: true, lastActiveAt: '2026-01-01T00:00:00.000Z', status: 'in_match' } }),
    ]);
    const k = new Kraty(baseOpts(fetch));
    const res = await k.friends.heartbeat({ status: 'in_match' });
    expect(res.online).toBe(true);
    expect(res.status).toBe('in_match');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toContain('/sdk/v1/players/alice/presence');
    expect(calls[0]?.body).toMatchObject({ status: 'in_match' });
  });

  it('add POSTs the friend target and unwraps the result', async () => {
    const { fetch, calls } = makeFetch([
      () =>
        jsonRes(201, {
          data: {
            status: 'pending',
            request: {
              requestId: 'r1',
              direction: 'outgoing',
              player: { externalPlayerId: 'bob', displayIdentity: null },
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          },
        }),
    ]);
    const k = new Kraty(baseOpts(fetch));
    const res = await k.friends.add({ friendCode: 'K7P2QX' });
    expect(res.status).toBe('pending');
    expect(res.request?.player.externalPlayerId).toBe('bob');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toContain('/sdk/v1/players/alice/friends/requests');
    expect(calls[0]?.body).toMatchObject({ friendCode: 'K7P2QX' });
  });

  it('list returns the friends array with presence', async () => {
    const { fetch, calls } = makeFetch([
      () =>
        jsonRes(200, {
          data: {
            friends: [
              {
                externalPlayerId: 'bob',
                displayIdentity: { name: 'Bob', avatar: null, country: null },
                friendsSince: '2026-01-01T00:00:00.000Z',
                online: true,
                lastActiveAt: '2026-01-01T00:00:00.000Z',
                status: 'lobby',
              },
            ],
          },
        }),
    ]);
    const k = new Kraty(baseOpts(fetch));
    const friends = await k.friends.list();
    expect(friends).toHaveLength(1);
    expect(friends[0]?.online).toBe(true);
    expect(calls[0]?.url).toContain('/sdk/v1/players/alice/friends');
  });

  it('search encodes the query and limit', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { results: [] } }),
    ]);
    const k = new Kraty(baseOpts(fetch));
    await k.friends.search('Bo b', { limit: 5 });
    expect(calls[0]?.url).toContain('/sdk/v1/players/alice/friends/search');
    expect(calls[0]?.url).toContain('q=Bo+b');
    expect(calls[0]?.url).toContain('limit=5');
  });

  it('suggestions hits the suggestions path with limit and progression', async () => {
    const { fetch, calls } = makeFetch([
      () =>
        jsonRes(200, {
          data: {
            suggestions: [
              {
                externalPlayerId: 'carol',
                displayIdentity: { name: 'Carol', avatar: null, country: null },
                online: false,
                lastActiveAt: null,
                status: null,
              },
            ],
          },
        }),
    ]);
    const k = new Kraty(baseOpts(fetch));
    const suggestions = await k.friends.suggestions({ limit: 5, progression: ['level'] });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.externalPlayerId).toBe('carol');
    expect(calls[0]?.url).toContain('/sdk/v1/players/alice/friends/suggestions');
    expect(calls[0]?.url).toContain('limit=5');
    expect(calls[0]?.url).toContain('progression=level');
  });

  it('accept POSTs to the accept sub-path and returns the friend', async () => {
    const { fetch, calls } = makeFetch([
      () =>
        jsonRes(200, {
          data: {
            friend: {
              externalPlayerId: 'bob',
              displayIdentity: null,
              friendsSince: '2026-01-01T00:00:00.000Z',
              online: false,
              lastActiveAt: null,
              status: null,
            },
          },
        }),
    ]);
    const k = new Kraty(baseOpts(fetch));
    const friend = await k.friends.accept('r1');
    expect(friend.externalPlayerId).toBe('bob');
    expect(calls[0]?.url).toContain('/sdk/v1/players/alice/friends/requests/r1/accept');
  });

  it('remove DELETEs the friend', async () => {
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: { removed: true } })]);
    const k = new Kraty(baseOpts(fetch));
    await k.friends.remove('bob');
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url).toContain('/sdk/v1/players/alice/friends/bob');
  });

  it('block POSTs /blocks and returns the blocked player', async () => {
    const { fetch, calls } = makeFetch([
      () =>
        jsonRes(201, {
          data: {
            blocked: {
              externalPlayerId: 'bob',
              displayIdentity: null,
              blockedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        }),
    ]);
    const k = new Kraty(baseOpts(fetch));
    const blocked = await k.friends.block({ externalPlayerId: 'bob' });
    expect(blocked.externalPlayerId).toBe('bob');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toContain('/sdk/v1/players/alice/blocks');
    expect(calls[0]?.body).toMatchObject({ externalPlayerId: 'bob' });
  });
});
