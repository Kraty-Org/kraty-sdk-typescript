import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kraty } from './index.js';

/** ChatClient + ModerationClient: URL shaping, bodies, the filter header, auto client ids. */

interface FakeCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function makeFetch(responses: Array<() => Response>) {
  const calls: FakeCall[] = [];
  let i = 0;
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: (init?.method ?? 'GET').toUpperCase(),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const factory = responses[i++];
    if (!factory) throw new Error(`fake fetch exhausted; got call ${i}`);
    return factory();
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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
const C = '0b8a6c56-49bd-4d5a-9d38-1f2b6a5f9b3e';

afterEach(() => vi.restoreAllMocks());

describe('ChatClient', () => {
  it('sends the profanity-filter choice as a header, and can change it at runtime', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { conversations: [], nextOffset: null } }),
      () => jsonRes(200, { data: { conversations: [], nextOffset: null } }),
      () => jsonRes(200, { data: { conversations: [], nextOffset: null } }),
    ]);
    const kraty = new Kraty({ ...baseOpts(fetch), chat: { profanityFilter: false } });
    await kraty.chat.conversations({ kind: 'direct', limit: 10 });
    expect(calls[0]!.url).toBe(`${P}/chat/conversations?kind=direct&limit=10`);
    expect(calls[0]!.headers['x-kraty-chat-filter']).toBe('off');
    kraty.client.setChatFilter(true);
    await kraty.chat.conversations();
    expect(calls[1]!.headers['x-kraty-chat-filter']).toBe('on');
    kraty.client.setChatFilter(null);
    await kraty.chat.conversations();
    expect(calls[2]!.headers['x-kraty-chat-filter']).toBeUndefined();
  });

  it('opens conversations and sends text and cards with a client message id', async () => {
    const msg = { messageId: 'm1', seq: 1, text: 'hi' };
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { conversationId: C, kind: 'direct' } }),
      () => jsonRes(201, { data: msg }),
      () => jsonRes(201, { data: msg }),
      () => jsonRes(201, { data: { conversationId: C, members: [] } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await expect(kraty.chat.openDirect({ friendCode: 'K7P2QX' })).resolves.toMatchObject({ kind: 'direct' });
    expect(calls[0]).toMatchObject({ method: 'POST', url: `${P}/chat/direct` });
    expect(calls[0]!.body).toMatchObject({ friendCode: 'K7P2QX' });

    await kraty.chat.send(C, 'hi', { replyToId: 'r1' });
    expect(calls[1]!.url).toBe(`${P}/chat/conversations/${C}/messages`);
    expect(calls[1]!.body).toMatchObject({ type: 'text', text: 'hi', replyToId: 'r1' });
    expect(typeof (calls[1]!.body as { clientMessageId: string }).clientMessageId).toBe('string');

    await kraty.chat.sendCustom(C, 'match_invite', { matchId: 'x' }, { clientMessageId: 'c-9', text: 'join me' });
    expect(calls[2]!.body).toMatchObject({ type: 'custom', customType: 'match_invite', payload: { matchId: 'x' }, text: 'join me', clientMessageId: 'c-9' });

    await kraty.chat.createGroup({ title: 'Squad', externalPlayerIds: ['bob'] });
    expect(calls[3]).toMatchObject({ method: 'POST', url: `${P}/chat/groups` });
  });

  it('pages messages and manages read state, roles and settings', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { messages: [], hasMore: false } }),
      () => jsonRes(200, { data: { lastReadSeq: 7 } }),
      () => jsonRes(200, { data: { conversationId: C } }),
      () => jsonRes(200, { data: { conversationId: C, removed: 'bob' } }),
      () => jsonRes(200, { data: { conversationId: C } }),
      () => jsonRes(200, { data: { channels: [{ conversationId: C }] } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await kraty.chat.messages(C, { before: 40, limit: 20 });
    expect(calls[0]!.url).toBe(`${P}/chat/conversations/${C}/messages?before=40&limit=20`);
    await expect(kraty.chat.markRead(C, 7)).resolves.toEqual({ lastReadSeq: 7 });
    expect(calls[1]!.body).toMatchObject({ seq: 7 });
    await kraty.chat.setRole(C, 'bob', 'admin');
    expect(calls[2]).toMatchObject({ method: 'PUT', url: `${P}/chat/conversations/${C}/members/bob/role` });
    await kraty.chat.removeMember(C, 'bob');
    expect(calls[3]).toMatchObject({ method: 'DELETE', url: `${P}/chat/conversations/${C}/members/bob` });
    await kraty.chat.setConversationSettings(C, { mutedUntil: null });
    expect(calls[4]).toMatchObject({ method: 'PUT', url: `${P}/chat/conversations/${C}/settings` });
    await expect(kraty.chat.channels()).resolves.toHaveLength(1);
  });
});

describe('ModerationClient', () => {
  it('reports, lists reports, reads status and acknowledges warnings', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(201, { data: { reportId: 'r1', status: 'open' } }),
      () => jsonRes(200, { data: { reports: [{ reportId: 'r1' }] } }),
      () => jsonRes(200, { data: { canChat: true, canPost: false, restrictions: [] } }),
      () => jsonRes(200, { data: { restrictionId: 'w1', kind: 'warning' } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await kraty.moderation.report({ targetExternalPlayerId: 'bob', category: 'harassment', context: 'chat', conversationId: C, messageIds: ['m1'] });
    expect(calls[0]).toMatchObject({ method: 'POST', url: `${P}/reports` });
    expect(calls[0]!.body).toMatchObject({ targetExternalPlayerId: 'bob', category: 'harassment' });
    await expect(kraty.moderation.reports({ limit: 5 })).resolves.toHaveLength(1);
    expect(calls[1]!.url).toBe(`${P}/reports?limit=5`);
    await expect(kraty.moderation.status()).resolves.toMatchObject({ canPost: false });
    await kraty.moderation.acknowledgeWarning('w1');
    expect(calls[3]!.url).toBe(`${P}/moderation/warnings/w1/acknowledge`);
  });
});

describe('ChatClient.editMessage', () => {
  it('PATCHes the message with the new text', async () => {
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: { messageId: 'm1', editedAt: '2026-10-15T00:00:00Z' } })]);
    const kraty = new Kraty(baseOpts(fetch));
    await expect(kraty.chat.editMessage(C, 'm1', 'fixed')).resolves.toMatchObject({ editedAt: '2026-10-15T00:00:00Z' });
    expect(calls[0]).toMatchObject({ method: 'PATCH', url: `${P}/chat/conversations/${C}/messages/m1` });
    expect(calls[0]!.body).toMatchObject({ text: 'fixed' });
  });
});
