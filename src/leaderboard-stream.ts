import { FinalizationReason } from './finalization.js';
import { openSseStream, type SseEvent, type SseStream } from './sse.js';

/**
 * One event emitted by the leaderboard SSE stream. `kind` is the SSE
 * `event:` line, typically:
 *
 * - `ready`: handshake, sent once after the subscription is wired.
 *   Safe to start posting progress as soon as this lands without
 *   missing the resulting update.
 * - `score_update`: a participant's score / rank changed; `data`
 *   carries the new entry.
 * - `finalized`: the board has ended and finalized (a session/lobby
 *   terminated, or the event window closed). `data` is a
 *   {@link LeaderboardFinalizedData}: the final `standings` (find your
 *   own placement by `participantId`) and why it ended (`reason`).
 *   Render final placements and stop expecting `score_update`s.
 * - `closed`: server is finalizing or closing. After this the
 *   stream completes.
 * - `connection` (`subscribe()` only): `data.state` is `reconnecting` or
 *   `connected`; the subscription reconnects on its own after a server
 *   `close`, a drop or 40 s of silence. A status, not an error.
 *
 * `data` is the parsed `data:` JSON line.
 */
export type LeaderboardStreamEvent = SseEvent;

/** One row of final standings in a `finalized` event. */
export interface LeaderboardStanding {
  participantId: string;
  rank: number;
  score: number;
  name: string;
  kind: 'player' | 'bot';
}

/**
 * Shape of the `data` on a `finalized` stream event. Narrow to it when
 * `event.kind === 'finalized'`:
 *
 * ```ts
 * for await (const ev of stream.events) {
 *   if (ev.kind === 'finalized') {
 *     const d = ev.data as unknown as LeaderboardFinalizedData;
 *     const me = d.standings.find((s) => s.participantId === myId);
 *     showResult(d.reason, me?.rank);
 *   }
 * }
 * ```
 */
export interface LeaderboardFinalizedData {
  leaderboardId: string;
  eventId: string;
  /** `session_terminated` = your lobby ended early; `window_closed` = the
   *  whole event ended. */
  reason: typeof FinalizationReason.SessionTerminated | typeof FinalizationReason.WindowClosed;
  standings: LeaderboardStanding[];
  occurredAt: string;
}

/**
 * Handle to an active SSE subscription. Iterate `events` to consume
 * server-pushed updates, call `close()` to stop.
 *
 * One connection: `live()` does NOT auto-reconnect on transport drop;
 * the iterable throws and you re-call `live(...)` after a backoff. The
 * high-level `subscribe(...)` reconnects on its own.
 */
export type LeaderboardStream = SseStream;

interface OpenArgs {
  fetchImpl: typeof fetch;
  baseUrl: string;
  leaderboardId: string;
  authHeader: string;
  playerSecret: string | null;
  sdkUserAgent: string;
  /** Called whenever bytes arrive (heartbeats included). */
  onActivity?: () => void;
}

/**
 * Opens an SSE subscription to a leaderboard. Returns a
 * `LeaderboardStream` handle whose `events` async-iterable yields
 * each parsed event. Does NOT auto-reconnect.
 */
export async function openLeaderboardStream(args: OpenArgs): Promise<LeaderboardStream> {
  return openSseStream({
    fetchImpl: args.fetchImpl,
    url: `${args.baseUrl}/sdk/v1/event-leaderboards/${encodeURIComponent(args.leaderboardId)}/stream`,
    authHeader: args.authHeader,
    playerSecret: args.playerSecret,
    sdkUserAgent: args.sdkUserAgent,
    label: 'leaderboard stream',
    ...(args.onActivity ? { onActivity: args.onActivity } : {}),
  });
}
