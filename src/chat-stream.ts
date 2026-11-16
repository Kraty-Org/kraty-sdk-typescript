import { KratyNetworkError } from './errors.js';
import type { StreamConnectionEvent } from './reconnect.js';
import { openSseStream, type SseEvent, type SseStream } from './sse.js';
import type { ChatMessage, ChatPlayerRef } from './types.js';

/**
 * The player's live chat feed: every conversation in their inbox, plus the
 * public channels they ask for. Messages arrive already resolved for this
 * player (their filter choice, their blocks).
 *
 * `kraty.chat.live()` / `watch()` heal themselves: when the server closes the
 * stream (scale-in, rebalancing, `slow_consumer`), the connection drops or
 * goes silent, they reconnect, catch every followed conversation up from the
 * last `seq` known (quiet ones from `ready.lastSeqs`), and deliver the
 * missed messages as ordinary `message` events (never twice). A `connection` event reports `reconnecting` / `connected`
 * so the game can show a subtle indicator.
 *
 * `openChatStream` (and `live({ autoReconnect: false })`) is the single
 * connection: a server `close` event is yielded, then the iterable throws a
 * `KratyNetworkError` like any other drop, and reconnecting + catching up
 * with `chat.messages(id, { after })` is up to you.
 */

export type ChatStreamEvent =
  | {
      kind: 'ready';
      externalPlayerId: string;
      conversationIds: string[];
      /** The followed channels: each is the conversation of the player's room (0-based). */
      channels: Array<{ key: string; conversationId: string; room: number }>;
      /**
       * Every followed conversation's latest `seq` at connect time (inbox and
       * channel rooms). The self-healing stream seeds its catch-up cursors
       * from it. Absent on older servers.
       */
      lastSeqs?: Record<string, number>;
    }
  | ({ kind: 'message' } & ChatMessage)
  | ({ kind: 'message_edited' } & ChatMessage)
  | { kind: 'message_deleted'; conversationId: string; messageId: string; seq: number }
  | { kind: 'typing'; conversationId: string; player: ChatPlayerRef }
  | { kind: 'read'; conversationId: string; externalPlayerId: string; seq: number }
  | { kind: 'conversation_added'; conversationId: string; /** Conversation kind (`direct`, `group`, …). */ conversationKind: string }
  | { kind: 'conversation_updated'; conversationId: string; title: string | null; metadata: Record<string, unknown>; memberCount: number }
  | { kind: 'conversation_removed'; conversationId: string; reason: string }
  | { kind: 'restriction'; restrictionId: string; restrictionKind: string; reason: string | null; expiresAt: string | null }
  | { kind: 'restriction_lifted'; restrictionId: string; restrictionKind: string }
  /**
   * Single connection only (`autoReconnect: false`): the server is closing the
   * stream (`shutdown`, `rebalance`, `slow_consumer`). Reconnect after
   * `retryAfterMs` and catch up. The self-healing stream handles it itself.
   */
  | { kind: 'close'; reason: string; retryAfterMs?: number }
  /** Self-healing stream only: `reconnecting` / `connected`. A status, not an error. */
  | StreamConnectionEvent;

/** Handle to an open chat stream. `close()` is idempotent. */
export interface ChatStream {
  events: AsyncIterable<ChatStreamEvent>;
  close(): Promise<void>;
}

interface OpenArgs {
  fetchImpl: typeof fetch;
  baseUrl: string;
  externalPlayerId: string;
  authHeader: string;
  playerSecret: string | null;
  sdkUserAgent: string;
  channels: readonly string[];
  filter: 'on' | 'off' | null;
  /** Called whenever bytes arrive (heartbeats included). */
  onActivity?: () => void;
}

/** @internal One raw chat SSE connection. */
export function openChatSse(args: OpenArgs): Promise<SseStream> {
  const params = new URLSearchParams();
  if (args.channels.length > 0) params.set('channels', args.channels.join(','));
  if (args.filter) params.set('filter', args.filter);
  const qs = params.toString();
  return openSseStream({
    fetchImpl: args.fetchImpl,
    url: `${args.baseUrl}/sdk/v1/players/${encodeURIComponent(args.externalPlayerId)}/chat/stream${qs ? `?${qs}` : ''}`,
    authHeader: args.authHeader,
    playerSecret: args.playerSecret,
    sdkUserAgent: args.sdkUserAgent,
    label: 'chat stream',
    ...(args.onActivity ? { onActivity: args.onActivity } : {}),
  });
}

/**
 * @internal Wire event → `ChatStreamEvent`. Payloads that carry their own
 * `kind` field (a conversation kind, a restriction kind) are renamed so
 * `kind` is always the event type.
 */
export function mapChatEvent(ev: SseEvent): ChatStreamEvent {
  const data = { ...(ev.data as Record<string, unknown>) };
  if (ev.kind === 'conversation_added' && 'kind' in data) {
    data['conversationKind'] = data['kind'];
  }
  if ((ev.kind === 'restriction' || ev.kind === 'restriction_lifted') && 'kind' in data) {
    data['restrictionKind'] = data['kind'];
  }
  delete data['kind'];
  return { ...data, kind: ev.kind } as ChatStreamEvent;
}

/**
 * One chat stream connection, no reconnect (the low-level form; prefer
 * `kraty.chat.live()`). A server `close` is yielded, then the iterable throws.
 */
export async function openChatStream(args: OpenArgs): Promise<ChatStream> {
  const raw = await openChatSse(args);

  async function* iterate(): AsyncGenerator<ChatStreamEvent, void, unknown> {
    for await (const ev of raw.events) {
      const mapped = mapChatEvent(ev);
      yield mapped;
      if (ev.kind === 'close') {
        await raw.close();
        throw new KratyNetworkError(
          `chat stream closed by the server (${String(ev.data['reason'] ?? 'unknown')}): reconnect and catch up`,
        );
      }
    }
  }

  return { events: iterate(), close: () => raw.close() };
}
