import { openSseStream, type SseStream } from './sse.js';
import type { ChatMessage, ChatPlayerRef } from './types.js';

/**
 * The player's live chat feed: every conversation in their inbox, plus the
 * public channels they ask for. Messages arrive already resolved for this
 * player (their filter choice, their blocks). After a reconnect, catch up
 * each conversation with `chat.messages(id, { after: lastSeqSeen })`.
 */

export type ChatStreamEvent =
  | { kind: 'ready'; externalPlayerId: string; conversationIds: string[]; channels: Array<{ key: string; conversationId: string }> }
  | ({ kind: 'message' } & ChatMessage)
  | ({ kind: 'message_edited' } & ChatMessage)
  | { kind: 'message_deleted'; conversationId: string; messageId: string; seq: number }
  | { kind: 'typing'; conversationId: string; player: ChatPlayerRef }
  | { kind: 'read'; conversationId: string; externalPlayerId: string; seq: number }
  | { kind: 'conversation_added'; conversationId: string; /** Conversation kind (`direct`, `group`, …). */ conversationKind: string }
  | { kind: 'conversation_updated'; conversationId: string; title: string | null; metadata: Record<string, unknown>; memberCount: number }
  | { kind: 'conversation_removed'; conversationId: string; reason: string }
  | { kind: 'restriction'; restrictionId: string; restrictionKind: string; reason: string | null; expiresAt: string | null }
  | { kind: 'restriction_lifted'; restrictionId: string; restrictionKind: string };

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
}

export async function openChatStream(args: OpenArgs): Promise<ChatStream> {
  const params = new URLSearchParams();
  if (args.channels.length > 0) params.set('channels', args.channels.join(','));
  if (args.filter) params.set('filter', args.filter);
  const qs = params.toString();
  const raw: SseStream = await openSseStream({
    fetchImpl: args.fetchImpl,
    url: `${args.baseUrl}/sdk/v1/players/${encodeURIComponent(args.externalPlayerId)}/chat/stream${qs ? `?${qs}` : ''}`,
    authHeader: args.authHeader,
    playerSecret: args.playerSecret,
    sdkUserAgent: args.sdkUserAgent,
    label: 'chat stream',
  });

  // Wire payloads that carry their own `kind` field (a conversation kind,
  // a restriction kind) are renamed so `kind` is always the event type.
  async function* iterate(): AsyncGenerator<ChatStreamEvent, void, unknown> {
    for await (const ev of raw.events) {
      const data = { ...(ev.data as Record<string, unknown>) };
      if (ev.kind === 'conversation_added' && 'kind' in data) {
        data['conversationKind'] = data['kind'];
      }
      if ((ev.kind === 'restriction' || ev.kind === 'restriction_lifted') && 'kind' in data) {
        data['restrictionKind'] = data['kind'];
      }
      delete data['kind'];
      yield { ...data, kind: ev.kind } as ChatStreamEvent;
    }
  }

  return { events: iterate(), close: () => raw.close() };
}
