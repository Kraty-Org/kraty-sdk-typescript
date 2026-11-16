import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kraty } from './index.js';

/** DailyLoginClient: URL shaping, `{ data }` unwrapping, and the null calendar. */

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

describe('DailyLoginClient', () => {
  it('read GETs the active player\'s calendar and unwraps it', async () => {
    const calendar = {
      days: [{ day: 1, entries: [{ type: 'currency', currencyKey: 'gems', amount: 10 }] }],
      afterLastDay: 'restart',
      itemKey: 'login_calendar',
      loginStreak: 1,
      currentDay: 1,
      paidToday: true,
      todayGrantId: 'g-1',
      nextDayAt: '2030-01-08T00:00:00.000Z',
    };
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: calendar })]);
    const kraty = new Kraty(baseOpts(fetch));
    await expect(kraty.dailyLogin.read()).resolves.toEqual(calendar);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.test.kraty.io/sdk/v1/players/alice/daily-login');
  });

  it('read resolves null when the game has no calendar, and honours `as`', async () => {
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: null })]);
    const kraty = new Kraty(baseOpts(fetch));
    await expect(kraty.dailyLogin.read({ as: 'bob 1' })).resolves.toBeNull();
    expect(calls[0]!.url).toBe('https://api.test.kraty.io/sdk/v1/players/bob%201/daily-login');
  });
});
