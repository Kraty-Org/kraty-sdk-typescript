import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kraty, KratyApiError, KratyChatNotSentError, KratyNetworkError } from './index.js';

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

    // A different conversation: C is now in its 1 s direct-chat cooldown.
    await kraty.chat.sendCustom('d2', 'match_invite', { matchId: 'x' }, { clientMessageId: 'c-9', text: 'join me' });
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

describe('ChatClient anti-spam', () => {
  const retrying = (fetchImpl: typeof fetch) => ({
    ...baseOpts(fetchImpl),
    retry: { attempts: 4, initialDelayMs: 1, maxDelayMs: 5, jitter: 0 },
  });
  const slowMode = () =>
    jsonRes(429, { error: { code: 'chat_slow_mode', message: 'wait', details: { retryAfterSeconds: 12, cooldownSeconds: 15 } } });

  it('never retries a send or an edit on 429, and surfaces retryAfterSeconds', async () => {
    const { fetch, calls } = makeFetch([
      slowMode,
      () => jsonRes(429, { error: { code: 'chat_rate_limited', message: 'slow down', details: { retryAfterSeconds: 40, limitPerMinute: 30 } } }),
    ]);
    const kraty = new Kraty(retrying(fetch));
    const err = await kraty.chat.send(C, 'hi').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KratyApiError);
    expect((err as KratyApiError).isChatSlowMode).toBe(true);
    expect((err as KratyApiError).retryAfterSeconds).toBe(12);
    expect(calls).toHaveLength(1);

    const editErr = await kraty.chat.editMessage(C, 'm1', 'again').catch((e: unknown) => e);
    expect((editErr as KratyApiError).isChatRateLimited).toBe(true);
    expect((editErr as KratyApiError).retryAfterSeconds).toBe(40);
    expect(calls).toHaveLength(2);
  });

  it('still retries other chat calls on 429, and retries a send on a network failure with the same clientMessageId', async () => {
    let n = 0;
    const { fetch, calls } = makeFetch([
      () => jsonRes(429, { error: { code: 'rate_limited', message: 'slow' } }),
      () => jsonRes(200, { data: { total: 0, conversations: 0, byKind: {} } }),
      () => {
        n++;
        throw new TypeError('socket hang up');
      },
      () => jsonRes(201, { data: { messageId: 'm1', seq: 1 } }),
    ]);
    const kraty = new Kraty(retrying(fetch));
    await expect(kraty.chat.unread()).resolves.toMatchObject({ total: 0 });
    expect(calls).toHaveLength(2);
    await expect(kraty.chat.send(C, 'hi')).resolves.toMatchObject({ messageId: 'm1' });
    expect(n).toBe(1);
    const first = (calls[2]!.body as { clientMessageId: string }).clientMessageId;
    expect(first).toEqual(expect.any(String));
    expect((calls[3]!.body as { clientMessageId: string }).clientMessageId).toBe(first);
  });

  it('tracks the cooldown from the conversation view, the config and 429s', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
      const G = 'guild-conv';
      const { fetch } = makeFetch([
        () => jsonRes(200, { data: { conversationId: C, kind: 'channel', channel: { key: 'world', cooldownSeconds: 30, room: 2 } } }),
        () => jsonRes(201, { data: { messageId: 'm1', seq: 1 } }),
        () => jsonRes(200, { data: { kinds: { guild: { enabled: true, profanityFilter: 'always', cooldownSeconds: 5 } } } }),
        () => jsonRes(200, { data: { conversations: [{ conversationId: G, kind: 'guild', channel: null }], nextOffset: null } }),
        () => jsonRes(201, { data: { messageId: 'm2', seq: 1 } }),
        slowMode,
      ]);
      const kraty = new Kraty(baseOpts(fetch));
      expect(kraty.chat.cooldownRemaining(C)).toBe(0);

      await kraty.chat.channel('world');
      await kraty.chat.send(C, 'hi all');
      expect(kraty.chat.cooldownRemaining(C)).toBe(30);
      vi.advanceTimersByTime(29_500);
      expect(kraty.chat.cooldownRemaining(C)).toBe(1);
      vi.advanceTimersByTime(500);
      expect(kraty.chat.cooldownRemaining(C)).toBe(0);

      await kraty.chat.config();
      await kraty.chat.conversations();
      await kraty.chat.send(G, 'gg');
      expect(kraty.chat.cooldownRemaining(G)).toBe(5);

      vi.advanceTimersByTime(5_000);
      await expect(kraty.chat.send(G, 'gg again')).rejects.toBeInstanceOf(KratyApiError);
      expect(kraty.chat.cooldownRemaining(G)).toBe(12);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips the typing call in public channels', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { channels: [{ conversationId: C, kind: 'channel', channel: { key: 'world', cooldownSeconds: 15 } }] } }),
      () => jsonRes(200, { data: { conversationId: 'd1', kind: 'direct', channel: null } }),
      () => jsonRes(200, { data: {} }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await kraty.chat.channels();
    await kraty.chat.typing(C);
    expect(calls).toHaveLength(1);
    await kraty.chat.openDirect({ externalPlayerId: 'bob' });
    await kraty.chat.typing('d1');
    expect(calls[2]).toMatchObject({ method: 'POST', url: `${P}/chat/conversations/d1/typing` });
  });
});

describe('chat stream close (single connection)', () => {
  it('yields the close event, then throws like a drop', async () => {
    const sse = 'event: ready\ndata: {"externalPlayerId":"alice","conversationIds":[],"channels":[{"key":"world","conversationId":"c1","room":3}]}\n\n'
      + 'event: close\ndata: {"reason":"slow_consumer"}\n\n';
    const { fetch } = makeFetch([() => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })]);
    const kraty = new Kraty(baseOpts(fetch));
    const stream = await kraty.chat.live({ channels: ['world'], autoReconnect: false });
    const seen: unknown[] = [];
    const err = await (async () => {
      for await (const ev of stream.events) seen.push(ev);
    })().catch((e: unknown) => e);
    expect(seen).toEqual([
      { kind: 'ready', externalPlayerId: 'alice', conversationIds: [], channels: [{ key: 'world', conversationId: 'c1', room: 3 }] },
      { kind: 'close', reason: 'slow_consumer' },
    ]);
    expect(err).toBeInstanceOf(KratyNetworkError);
  });
});

// ── Outbox: sends that ride out busy servers and flaky networks ──────────

const busy = (retryAfter = '1') => () =>
  new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'busy', details: { retryAfterSeconds: Number(retryAfter) } } }), {
    status: 503,
    headers: { 'content-type': 'application/json', 'retry-after': retryAfter },
  });
const posted = (seq: number, clientMessageId?: string) => () =>
  jsonRes(201, { data: { messageId: `m${seq}`, conversationId: C, seq, clientMessageId: clientMessageId ?? null } });
const cmid = (call: FakeCall | undefined) => (call!.body as { clientMessageId: string }).clientMessageId;

describe('ChatClient outbox', () => {
  afterEach(() => vi.useRealTimers());

  it('sends after two busy 503s with the same clientMessageId, exposed at once', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = makeFetch([busy('1'), busy('2'), posted(1)]);
    const kraty = new Kraty(baseOpts(fetch));
    const p = kraty.chat.send(C, 'hi');
    expect(p.clientMessageId).toEqual(expect.any(String));
    expect(p.conversationId).toBe(C);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(p).resolves.toMatchObject({ messageId: 'm1' });
    expect(calls).toHaveLength(3);
    expect(calls.map(cmid)).toEqual([p.clientMessageId, p.clientMessageId, p.clientMessageId]);
  });

  it('keeps per-conversation order: one in flight, the next waits for it', async () => {
    vi.useFakeTimers();
    // Responses in call order: first (busy), elsewhere, first again, second.
    const { fetch, calls } = makeFetch([busy('1'), posted(9), posted(1), posted(2)]);
    const kraty = new Kraty(baseOpts(fetch));
    const order: string[] = [];
    const a = kraty.chat.send(C, 'first').then((m) => order.push(`first:${m.seq}`));
    const b = kraty.chat.send(C, 'second').then((m) => order.push(`second:${m.seq}`));
    const other = kraty.chat.send('other-conv', 'elsewhere').then(() => order.push('other'));
    await vi.advanceTimersByTimeAsync(0);
    // `first` is waiting out the 503; `second` hasn't gone out, another conversation isn't blocked.
    expect(calls.map((c) => (c.body as { text: string }).text)).toEqual(['first', 'elsewhere']);
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all([a, b, other]);
    expect(calls.map((c) => (c.body as { text: string }).text)).toEqual(['first', 'elsewhere', 'first', 'second']);
    expect(order).toEqual(['other', 'first:1', 'second:2']);
  });

  it('never retries a 429 or another 4xx', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(429, { error: { code: 'chat_duplicate_message', message: 'dup', details: { retryAfterSeconds: 5 } } }),
      () => jsonRes(400, { error: { code: 'validation_failed', message: 'too long' } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    const dup = await kraty.chat.send(C, 'hi').catch((e: unknown) => e);
    expect((dup as KratyApiError).isChatDuplicateMessage).toBe(true);
    const invalid = await kraty.chat.send('other-conv', 'x'.repeat(5000)).catch((e: unknown) => e);
    expect((invalid as KratyApiError).isValidationFailed).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('a duplicate or rate-limited refusal never holds the conversation', async () => {
    const { fetch, calls } = makeFetch([
      () => jsonRes(429, { error: { code: 'chat_duplicate_message', message: 'dup', details: { retryAfterSeconds: 30 } } }),
      posted(1),
      () => jsonRes(429, { error: { code: 'chat_rate_limited', message: 'slow down', details: { retryAfterSeconds: 40 } } }),
      posted(2),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    const dup = await kraty.chat.send(C, 'gg').catch((e: unknown) => e);
    expect((dup as KratyApiError).isChatDuplicateMessage).toBe(true);
    expect(kraty.chat.cooldownRemaining(C)).toBe(0);
    // A different message goes out at once, not refused locally.
    await expect(kraty.chat.send(C, 'good game')).resolves.toMatchObject({ seq: 1 });

    const limited = await kraty.chat.send('other-conv', 'hi').catch((e: unknown) => e);
    expect((limited as KratyApiError).isChatRateLimited).toBe(true);
    expect(kraty.chat.cooldownRemaining('other-conv')).toBe(0);
    await expect(kraty.chat.send('other-conv', 'hi again')).resolves.toMatchObject({ seq: 2 });
    expect(calls.map((c) => (c.body as { text: string }).text)).toEqual(['gg', 'good game', 'hi', 'hi again']);
  });

  it('refuses a send during the cooldown locally, or waits for it with waitForCooldown', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = makeFetch([
      () => jsonRes(200, { data: { conversationId: C, kind: 'channel', channel: { key: 'world', cooldownSeconds: 30, room: 0 } } }),
      posted(1),
      posted(2),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await kraty.chat.channel('world');
    await kraty.chat.send(C, 'hi all');
    expect(calls).toHaveLength(2);

    const err = await kraty.chat.send(C, 'too soon').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KratyApiError);
    expect((err as KratyApiError).isChatSlowMode).toBe(true);
    expect((err as KratyApiError).retryAfterSeconds).toBe(30);
    expect((err as KratyApiError).details).toMatchObject({ local: true });
    expect(calls).toHaveLength(2);

    const held = kraty.chat.send(C, 'when allowed', { waitForCooldown: true });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(held).resolves.toMatchObject({ seq: 2 });
    expect(calls).toHaveLength(3);
    expect(calls[2]!.body).toMatchObject({ text: 'when allowed', clientMessageId: held.clientMessageId });
  });

  it('gives up after outboxTimeoutMs with KratyChatNotSentError, and retry() resends the same id', async () => {
    vi.useFakeTimers();
    let down = true;
    const calls: FakeCall[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: JSON.parse(init!.body as string), headers: {} });
      if (down) throw new TypeError('network down');
      return posted(1)();
    }) as unknown as typeof fetch;
    const kraty = new Kraty({ ...baseOpts(fetchImpl), chat: { outboxTimeoutMs: 5_000 } });
    const p = kraty.chat.send(C, 'hello?');
    const settled = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const err = await settled;
    expect(err).toBeInstanceOf(KratyChatNotSentError);
    expect(err).toBeInstanceOf(KratyNetworkError);
    const notSent = err as KratyChatNotSentError;
    expect(notSent.clientMessageId).toBe(p.clientMessageId);
    expect(notSent.conversationId).toBe(C);
    expect(notSent.lastError).toBeInstanceOf(KratyNetworkError);
    const tries = calls.length;
    expect(tries).toBeGreaterThan(2);
    expect(new Set(calls.map(cmid))).toEqual(new Set([p.clientMessageId]));

    down = false;
    await expect(notSent.retry()).resolves.toMatchObject({ messageId: 'm1' });
    expect(calls).toHaveLength(tries + 1);
    expect(cmid(calls[tries])).toBe(p.clientMessageId);
  });

  it('retries an edit through a busy server', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = makeFetch([busy('1'), () => jsonRes(200, { data: { messageId: 'm1', editedAt: 'x' } })]);
    const kraty = new Kraty(baseOpts(fetch));
    const p = kraty.chat.editMessage(C, 'm1', 'fixed');
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(p).resolves.toMatchObject({ editedAt: 'x' });
    expect(calls.map((c) => c.method)).toEqual(['PATCH', 'PATCH']);
  });
});

// ── Self-healing stream ──────────────────────────────────────────────────

const enc = new TextEncoder();
const sseRes = (body: string) => () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
const ev = (kind: string, data: unknown) => `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;
const wireMsg = (seq: number, conversationId = 'c1') => ({ messageId: `m${seq}`, conversationId, seq, text: `t${seq}` });
const ready = ev('ready', { externalPlayerId: 'alice', conversationIds: ['c1'], channels: [] });

/** A stream body the test feeds by hand; it stays open until ended or cancelled. */
function liveBody() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start: (c) => { ctrl = c; } });
  return {
    res: () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
  };
}

type Seen = { kind: string; seq?: number; state?: string; reason?: string; retryInMs?: number };
const brief = (e: Record<string, unknown>): Seen => {
  const out: Seen = { kind: String(e['kind']) };
  if (typeof e['seq'] === 'number') out.seq = e['seq'];
  if (typeof e['state'] === 'string') out.state = e['state'];
  if (typeof e['reason'] === 'string') out.reason = e['reason'];
  return out;
};

describe('chat stream auto-reconnect', () => {
  it('reconnects after close with retryAfterMs and catches up without duplicates', async () => {
    const second = liveBody();
    second.push(ready);
    const { fetch, calls } = makeFetch([
      sseRes(ready + ev('message', wireMsg(1)) + ev('message', wireMsg(2)) + ev('close', { reason: 'rebalance', retryAfterMs: 20 })),
      second.res,
      () => jsonRes(200, { data: { messages: [wireMsg(3), wireMsg(4)], hasMore: true } }),
      () => jsonRes(200, { data: { messages: [wireMsg(5)], hasMore: false } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    const stream = await kraty.chat.live();
    const seen: Seen[] = [];
    let retryInMs: number | undefined;
    for await (const e of stream.events) {
      seen.push(brief(e as unknown as Record<string, unknown>));
      if (e.kind === 'connection' && e.state === 'reconnecting') retryInMs = e.retryInMs;
      // The new connection goes live: replay 3 (already caught up) and a new 6.
      if (e.kind === 'connection' && e.state === 'connected' && seen.length > 4) {
        second.push(ev('message', wireMsg(3)) + ev('message', wireMsg(6)));
      }
      if (e.kind === 'message' && e.seq === 6) break;
    }
    expect(retryInMs).toBe(20);
    expect(seen).toEqual([
      { kind: 'ready' },
      { kind: 'connection', state: 'connected' },
      { kind: 'message', seq: 1 },
      { kind: 'message', seq: 2 },
      { kind: 'connection', state: 'reconnecting', reason: 'rebalance' },
      { kind: 'ready' },
      { kind: 'message', seq: 3 },
      { kind: 'message', seq: 4 },
      { kind: 'message', seq: 5 },
      { kind: 'connection', state: 'connected' },
      { kind: 'message', seq: 6 },
    ]);
    expect(calls[2]!.url).toBe(`${P}/chat/conversations/c1/messages?after=2`);
    expect(calls[3]!.url).toBe(`${P}/chat/conversations/c1/messages?after=4`);
  });

  it('catches up quiet conversations from ready.lastSeqs and new ones from the start', async () => {
    const readyWith = (conversationIds: string[], lastSeqs: Record<string, number>) =>
      ev('ready', { externalPlayerId: 'alice', conversationIds, channels: [], lastSeqs });
    const first = liveBody();
    first.push(readyWith(['dm', 'busy'], { dm: 7, busy: 3 }));
    const second = liveBody();
    // During the gap: `dm` got seq 8, `added` was created (announced live), `fresh` was created unannounced.
    second.push(readyWith(['dm', 'busy', 'added', 'fresh'], { dm: 8, busy: 3, added: 1, fresh: 2 }));
    const { fetch, calls } = makeFetch([
      first.res,
      second.res,
      () => jsonRes(200, { data: { messages: [wireMsg(8, 'dm')], hasMore: false } }),
      () => jsonRes(200, { data: { messages: [wireMsg(1, 'added')], hasMore: false } }),
      () => jsonRes(200, { data: { messages: [wireMsg(1, 'fresh'), wireMsg(2, 'fresh')], hasMore: false } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    const stream = await kraty.chat.live();
    const seen: Array<Seen & { conversationId?: string }> = [];
    for await (const e of stream.events) {
      seen.push({ ...brief(e as unknown as Record<string, unknown>), ...('conversationId' in e ? { conversationId: e.conversationId } : {}) });
      if (e.kind === 'connection' && e.state === 'connected' && seen.length === 2) {
        first.push(ev('conversation_added', { conversationId: 'added', kind: 'group' }) + ev('close', { reason: 'rebalance', retryAfterMs: 0 }));
      }
      if (e.kind === 'connection' && e.state === 'connected' && seen.length > 2) break;
    }
    // `busy` is skipped (nothing newer than its cursor); the others are fetched from their cursors.
    expect(calls.slice(2).map((c) => c.url)).toEqual([
      `${P}/chat/conversations/dm/messages?after=7`,
      `${P}/chat/conversations/added/messages?after=0`,
      `${P}/chat/conversations/fresh/messages?after=0`,
    ]);
    expect(seen.filter((e) => e.kind === 'message').map((e) => `${e.conversationId}:${e.seq}`)).toEqual([
      'dm:8',
      'added:1',
      'fresh:1',
      'fresh:2',
    ]);
    await stream.close();
  });

  it('stops a catch-up at an empty page that says hasMore, and retries it on the next reconnect', async () => {
    const third = liveBody();
    third.push(ready);
    const { fetch, calls } = makeFetch([
      sseRes(ready + ev('message', wireMsg(4)) + ev('close', { reason: 'rebalance', retryAfterMs: 0 })),
      sseRes(ready + ev('close', { reason: 'rebalance', retryAfterMs: 0 })),
      () => jsonRes(200, { data: { messages: [], hasMore: true } }),
      third.res,
      () => jsonRes(200, { data: { messages: [wireMsg(5)], hasMore: false } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    const stream = await kraty.chat.live();
    const seqs: number[] = [];
    let connected = 0;
    for await (const e of stream.events) {
      if (e.kind === 'message') seqs.push(e.seq);
      if (e.kind === 'connection' && e.state === 'connected' && ++connected === 3) break;
    }
    expect(seqs).toEqual([4, 5]);
    expect(calls.filter((c) => c.url.includes('/messages')).map((c) => c.url)).toEqual([
      `${P}/chat/conversations/c1/messages?after=4`,
      `${P}/chat/conversations/c1/messages?after=4`,
    ]);
    await stream.close();
  });

  it('heartbeatTimeoutMs: 0 turns the watchdog off', async () => {
    const body = liveBody();
    const { fetch, calls } = makeFetch([body.res]);
    const kraty = new Kraty(baseOpts(fetch));
    const stream = await kraty.chat.live({ heartbeatTimeoutMs: 0 });
    body.push(ready);
    setTimeout(() => body.push(ev('message', wireMsg(1))), 80);
    const seen: Seen[] = [];
    for await (const e of stream.events) {
      seen.push(brief(e as unknown as Record<string, unknown>));
      if (e.kind === 'message') break;
    }
    expect(seen).toEqual([{ kind: 'ready' }, { kind: 'connection', state: 'connected' }, { kind: 'message', seq: 1 }]);
    expect(calls).toHaveLength(1);
  });

  it('treats silence as a dead connection (pings keep it alive)', async () => {
    const first = liveBody();
    const second = liveBody();
    second.push(ready);
    const { fetch, calls } = makeFetch([first.res, second.res]);
    const kraty = new Kraty(baseOpts(fetch));
    const stream = await kraty.chat.live({ heartbeatTimeoutMs: 60 });
    first.push(ready);
    const pinger = setInterval(() => first.push(': ping\n\n'), 20);
    setTimeout(() => clearInterval(pinger), 200);
    const seen: Seen[] = [];
    const started = Date.now();
    for await (const e of stream.events) {
      seen.push(brief(e as unknown as Record<string, unknown>));
      if (e.kind === 'connection' && e.state === 'reconnecting') second.push(ready);
      if (seen.length === 5) break;
    }
    // Pinged for 200 ms (over three heartbeat windows) before the silence tripped it.
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    expect(seen).toEqual([
      { kind: 'ready' },
      { kind: 'connection', state: 'connected' },
      { kind: 'connection', state: 'reconnecting', reason: 'heartbeat_timeout' },
      { kind: 'ready' },
      { kind: 'connection', state: 'connected' },
    ]);
    expect(calls).toHaveLength(2);
  });

  it('rides out a busy 503 on open, and only throws on a real refusal', async () => {
    const { fetch } = makeFetch([
      () => new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'busy' } }), { status: 503, headers: { 'retry-after': '0' } }),
      sseRes(ready),
      () => jsonRes(403, { error: { code: 'chat_disabled', message: 'off' } }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    const stream = await kraty.chat.live();
    const seen: Seen[] = [];
    const err = await (async () => {
      for await (const e of stream.events) seen.push(brief(e as unknown as Record<string, unknown>));
    })().catch((e: unknown) => e);
    expect(seen.slice(0, 3)).toEqual([
      { kind: 'connection', state: 'reconnecting', reason: 'busy' },
      { kind: 'ready' },
      { kind: 'connection', state: 'connected' },
    ]);
    // The second connection ended; the reconnect was refused for real.
    expect(seen[3]).toMatchObject({ kind: 'connection', state: 'reconnecting', reason: 'ended' });
    expect((err as KratyApiError).code).toBe('chat_disabled');
  });

  it('rejects at once when the first open is refused', async () => {
    const { fetch } = makeFetch([() => jsonRes(403, { error: { code: 'chat_disabled', message: 'off' } })]);
    const kraty = new Kraty(baseOpts(fetch));
    await expect(kraty.chat.live()).rejects.toMatchObject({ code: 'chat_disabled' });
  });
});
