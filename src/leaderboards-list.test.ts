import { describe, expect, it, vi } from 'vitest';
import { Kraty } from './index.js';

/**
 * LeaderboardsClient.list: `GET /sdk/v1/leaderboards` with `{ data }`
 * unwrapping. Fake-fetch style mirrors friends.test.ts.
 */

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('LeaderboardsClient.list', () => {
  it('GETs /sdk/v1/leaderboards and returns the unwrapped summaries', async () => {
    const board = {
      key: 'weekly_global',
      name: 'Weekly',
      description: null,
      resetCadence: 'weekly',
      nextResetAt: '2026-10-05T00:00:00.000Z',
      acceptClientScores: true,
      contextSegments: [],
    };
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: (init?.method ?? 'GET').toUpperCase() });
      return jsonRes(200, { data: [board] });
    }) as unknown as typeof fetch;

    const kraty = new Kraty({
      apiKey: 'pUUVdrM8.djr4-0Iv9h1JvVNSMZNDmSsSN7lSVq2F9dG6DG4A5uQ',
      baseUrl: 'https://api.test.kraty.io',
      fetch: fetchImpl,
      retry: { attempts: 1, initialDelayMs: 1, maxDelayMs: 5, jitter: 0 },
    });

    const out = await kraty.leaderboards.list();

    expect(out).toEqual([board]);
    expect(calls).toEqual([{ url: 'https://api.test.kraty.io/sdk/v1/leaderboards', method: 'GET' }]);
  });
});
