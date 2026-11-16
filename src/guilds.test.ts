import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kraty } from './index.js';

/** GuildsClient: URL shaping, bodies, `{ data }` unwrapping, null guild, `as`. */

interface FakeCall {
  url: string;
  method: string;
  body: unknown;
}

function makeFetch(responses: Array<() => Response>) {
  const calls: FakeCall[] = [];
  let i = 0;
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: (init?.method ?? 'GET').toUpperCase(),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const factory = responses[i++];
    if (!factory) throw new Error(`fake fetch exhausted; got call ${i}`);
    return factory();
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

const jsonRes = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

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

const P = 'https://api.test.kraty.io/sdk/v1/players/alice';
const G = '0b8a6c56-49bd-4d5a-9d38-1f2b6a5f9b3e';

afterEach(() => vi.restoreAllMocks());

describe('GuildsClient', () => {
  it('reads config, my guild (null when guildless) and a guild', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { enabled: true, maxMembers: 50 } }),
      () => jsonRes(200, { data: null }),
      () => jsonRes(200, { data: { guildId: G, members: [] } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await expect(kraty.guilds.config()).resolves.toMatchObject({ maxMembers: 50 });
    await expect(kraty.guilds.mine()).resolves.toBeNull();
    await expect(kraty.guilds.get(G)).resolves.toMatchObject({ guildId: G });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${P}/guilds/config`,
      `GET ${P}/guild`,
      `GET ${P}/guilds/${G}`,
    ]);
  });

  it('search / recommended / leaderboard build their query strings', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { guilds: [{ guildId: G }] } }),
      () => jsonRes(200, { data: { guilds: [] } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await expect(
      kraty.guilds.search('night owls', { country: 'US', limit: 5 }),
    ).resolves.toHaveLength(1);
    await kraty.guilds.recommended();
    expect(calls[0]!.url).toBe(`${P}/guilds?q=night+owls&country=US&limit=5`);
    expect(calls[1]!.url).toBe(`${P}/guilds/recommended`);
  });

  it('searchPage pages with offset and reports nextOffset (null at the end, and from an older server)', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { guilds: [{ guildId: G }], nextOffset: 20 } }),
      () => jsonRes(200, { data: { guilds: [], nextOffset: null } }),
      () => jsonRes(200, { data: { guilds: [] } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await expect(kraty.guilds.searchPage('owls')).resolves.toEqual({ guilds: [{ guildId: G }], nextOffset: 20 });
    await expect(kraty.guilds.searchPage('owls', { offset: 20, limit: 20 })).resolves.toMatchObject({
      nextOffset: null,
    });
    await expect(kraty.guilds.searchPage('owls')).resolves.toMatchObject({ nextOffset: null });
    expect(calls[0]!.url).toBe(`${P}/guilds?q=owls`);
    expect(calls[1]!.url).toBe(`${P}/guilds?q=owls&limit=20&offset=20`);
  });

  it('create / join / leave send the right bodies with an idempotency key', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(201, { data: { guild: { guildId: G } } }),
      () => jsonRes(201, { data: { status: 'requested', request: { requestId: 'r1' } } }),
      () => jsonRes(200, { data: { guildId: G, disbanded: false, newLeader: null } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await kraty.guilds.create({ name: 'Night Owls', joinType: 'request' });
    await expect(kraty.guilds.join(G, { message: 'hi' })).resolves.toMatchObject({ status: 'requested' });
    await kraty.guilds.leave();
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `${P}/guilds`,
      body: { name: 'Night Owls', joinType: 'request', idempotencyKey: 'idem-1' },
    });
    expect(calls[1]).toMatchObject({ method: 'POST', url: `${P}/guilds/${G}/join`, body: { message: 'hi' } });
    expect(calls[2]).toMatchObject({ method: 'POST', url: `${P}/guild/leave` });
  });

  it('officer actions target members by external id (encoded) and honour `as`', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { guildId: G } }),
      () => jsonRes(200, { data: { guildId: G } }),
      () => jsonRes(204, null),
      () => jsonRes(200, { data: { guildId: G } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await kraty.guilds.kick('bob 1');
    await kraty.guilds.transferLeadership('carol', { as: 'dave' });
    await kraty.guilds.declineRequest('req-1');
    await kraty.guilds.promote('erin');
    expect(calls[0]!.url).toBe(`${P}/guild/members/bob%201/kick`);
    expect(calls[1]).toMatchObject({
      url: 'https://api.test.kraty.io/sdk/v1/players/dave/guild/leader',
      body: { externalPlayerId: 'carol' },
    });
    expect(calls[2]!.url).toBe(`${P}/guild/requests/req-1/decline`);
    expect(calls[3]!.url).toBe(`${P}/guild/members/erin/promote`);
  });

  it('help requests and donations', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(201, { data: { requestId: 'h1', status: 'open' } }),
      () => jsonRes(201, { data: { donationId: 'd1', amount: 1 } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await kraty.guilds.requestHelp({ type: 'item', resourceKey: 'life', amount: 3 });
    await kraty.guilds.donate('h1', { amount: 1 });
    expect(calls[0]).toMatchObject({
      url: `${P}/guild/help`,
      body: { type: 'item', resourceKey: 'life', amount: 3 },
    });
    expect(calls[1]).toMatchObject({ url: `${P}/guild/help/h1/donate`, body: { amount: 1 } });
  });
});
