import { KratyClient, defaultIdempotencyKey } from './client.js';
import { openChatStream, type ChatStream, type ChatStreamEvent } from './chat-stream.js';
import { KratyApiError } from './errors.js';
import { MembershipKind } from './finalization.js';
import {
  openLeaderboardStream,
  type LeaderboardStream,
  type LeaderboardStreamEvent,
} from './leaderboard-stream.js';
import {
  openInventoryStream,
  type InventoryStream,
  type InventoryStreamEvent,
} from './inventory-stream.js';
import type {
  ChatClientConfig,
  ChatConversation,
  ChatConversationDetail,
  ChatConversationPage,
  ChatMessage,
  ChatMessagePage,
  ChatPreferences,
  ChatUnread,
  ModerationStatus,
  MyReport,
  ReportInput,
  Restriction,
  BoardStandings,
  BlockedPlayer,
  Catalog,
  DailyLogin,
  ConsumeItemInput,
  ConsumeItemResult,
  DebitWalletInput,
  DebitWalletResult,
  ProgressWalletInput,
  ProgressWalletResult,
  EventLeaderboard,
  EventLeaderboardReadOptions,
  EventListing,
  EventTeamMembersPage,
  TeamMatchResult,
  PartnerInvite,
  RandomPartnerResult,
  PartnerSuggestion,
  TeamSeatView,
  Friend,
  FriendCode,
  FriendRequests,
  FriendSearchResult,
  FriendTarget,
  Gift,
  GiftCatalog,
  SendGiftInput,
  Grant,
  GrantSelfInput,
  Suggestion,
  Leaderboard,
  LeaderboardSummary,
  LeaderboardPeriods,
  LeaderboardReadOptions,
  LeaderboardScoreResult,
  StandingsReadOptions,
  Lobby,
  OpenCrateResponse,
  PlayerContext,
  PlayerIdentity,
  PlayerItemHolding,
  PlayerPresence,
  PlayerRegistration,
  PlayerWalletHolding,
  ProgressInput,
  SendFriendRequestResult,
  FinishAttemptResponse,
  ProgressResponse,
  StartAttemptResponse,
  SyntheticIdentity,
  TrackPurchaseInput,
  TrackPurchaseResult,
  Offer,
  OfferClaimResult,
  OfferImpressionResult,
  OfferTriggerInput,
  OfferTriggerResult,
  StoreTransactionIds,
  CreateGuildInput,
  GuildClientConfig,
  GuildDetail,
  GuildHelpDonation,
  GuildHelpOverview,
  GuildHelpRequest,
  GuildJoinRequest,
  GuildJoinResult,
  GuildLeaveResult,
  GuildProfilePatch,
  GuildSearchPage,
  GuildSummary,
  MyGuild,
  RecommendedGuild,
} from './types.js';

/** Wrapper helper: every response from the SDK API is `{ data: T }`. */
interface DataEnvelope<T> {
  data: T;
}

/**
 * Resolve which player a resource call should target.
 *
 *   - If the caller passed `as`, that wins (server-side tooling
 *     addressing a different player from a single SDK instance).
 *   - Otherwise the SDK's active identity is used, lazily
 *     creating one if this is the first player-scoped call on a
 *     fresh client. See `KratyClient.ensureIdentity()` for the
 *     three-tier resolution (constructor id → persisted store →
 *     fresh self-serve register).
 *
 * The dev never has to plumb the player id through their code:
 * `kraty.events.start('weekly')` Just Works after `new Kraty(...)`.
 */
async function resolvePlayerId(
  client: KratyClient,
  explicit: string | undefined,
  _methodLabel: string,
): Promise<string> {
  if (explicit) return explicit;
  const identity = await client.ensureIdentity();
  return identity.externalPlayerId;
}

export class EventsClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET /sdk/v1/players/:externalId/events: events whose current
   * window the active player can start now. Pass `{ as }` to address
   * a different player (server-side tooling only).
   */
  async listForPlayer(opts: { as?: string } = {}): Promise<EventListing[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'events.listForPlayer');
    const env = await this.client.request<DataEnvelope<EventListing[]>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/events`,
    );
    return env.data;
  }

  /**
   * POST /sdk/v1/players/:p/events/:e/start: start an attempt for
   * the active player. Atomically debits any configured entry cost;
   * on insufficient resources throws `KratyApiError` with
   * `isInsufficientEntryCost` true (the debit is rolled back, so
   * partial spends never persist).
   *
   * If matchmaking is still forming, throws with `isLobbyForming`
   * true; poll the lobby endpoint and retry start.
   */
  async start(
    eventKey: string,
    playerContext?: PlayerContext,
    opts: { as?: string } = {},
  ): Promise<StartAttemptResponse> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'events.start');
    const env = await this.client.request<DataEnvelope<StartAttemptResponse>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/events/${encodeURIComponent(
        eventKey,
      )}/start`,
      { playerContext },
    );
    // Track the session/event board for finalization catch-up (docs/05b);
    // fire-and-forget so it never adds latency to start.
    void this.client
      .trackMembership({ kind: MembershipKind.EventLeaderboard, leaderboardId: env.data.leaderboardId, eventKey })
      .catch(() => undefined);
    return env.data;
  }

  /**
   * POST /sdk/v1/players/:p/events/:e/attempts/:a/progress: push a
   * metric update. `mode: 'set'` writes the value; `'increment'` adds.
   *
   * Response carries `milestonesFired`: any per-metric milestone whose
   * threshold was crossed by THIS update. Each entry includes the
   * concrete grant rows the engine wrote, so a game can pop a "you
   * unlocked a chest!" toast without polling `/grants/pending`.
   */
  async progress(
    eventKey: string,
    attemptId: string,
    input: ProgressInput,
    opts: { as?: string } = {},
  ): Promise<ProgressResponse> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'events.progress');
    const env = await this.client.request<DataEnvelope<ProgressResponse>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/events/${encodeURIComponent(
        eventKey,
      )}/attempts/${encodeURIComponent(attemptId)}/progress`,
      input,
    );
    return env.data;
  }

  /**
   * POST /sdk/v1/players/:p/events/:e/attempts/:a/finish: end an
   * in-progress attempt NOW, locking in its current score. This is the
   * player-driven "I'm done" / "cash out my run" action.
   *
   * Use it for score-attack events (no completion target) where the player
   * decides when the run ends. Otherwise the attempt only finalizes when
   * the event window closes. `outcome` is `'completed'` for a score-attack
   * end (or a target that was already met → completion rewards roll now) or
   * `'expired'` when a target event is ended before its target (participation
   * only). Pull any rewards afterwards with `grants.collectAll()`.
   */
  async finish(
    eventKey: string,
    attemptId: string,
    opts: { as?: string } = {},
  ): Promise<FinishAttemptResponse> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'events.finish');
    const env = await this.client.request<DataEnvelope<FinishAttemptResponse>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/events/${encodeURIComponent(
        eventKey,
      )}/attempts/${encodeURIComponent(attemptId)}/finish`,
      {},
    );
    return env.data;
  }

  /**
   * GET /sdk/v1/players/:p/event-teams/:eventTeamId/members: your team's
   * members in rank order (by contribution), with `isSelf` on your row.
   * Only a member of the team may read it. Your own team score, goal and
   * milestones already come back on `listForPlayer` / `start` / `progress`
   * as `teams`; call this when you open a team roster view. Page with
   * `cursor` (the previous page's `nextCursor`).
   */
  async teamMembers(
    eventTeamId: string,
    opts: { cursor?: string; limit?: number; as?: string } = {},
  ): Promise<EventTeamMembersPage> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'events.teamMembers');
    const qs = new URLSearchParams();
    if (opts.cursor) qs.set('cursor', opts.cursor);
    if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const env = await this.client.request<DataEnvelope<EventTeamMembersPage>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/event-teams/${encodeURIComponent(
        eventTeamId,
      )}/members${suffix}`,
    );
    return env.data;
  }

  private eventPath(externalPlayerId: string, eventKey: string, rest: string): string {
    return `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/events/${encodeURIComponent(eventKey)}${rest}`;
  }

  /**
   * POST …/events/:eventKey/teams/match: your auto-matched team for the
   * active window, found or opened (`auto_match` events). Idempotent;
   * `start` matches a team-less player too, so this is optional.
   */
  async matchTeam(
    eventKey: string,
    opts: { idempotencyKey?: string; as?: string } = {},
  ): Promise<TeamMatchResult> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'events.matchTeam');
    const env = await this.client.request<DataEnvelope<TeamMatchResult>>(
      'POST',
      this.eventPath(externalPlayerId, eventKey, '/teams/match'),
      opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {},
    );
    return env.data;
  }

  /**
   * POST …/partners/invites: invite a partner by external id or friend
   * code (`partner_slots` events). Their pending invite to you is accepted
   * instead (`status: 'accepted'`).
   */
  async invitePartner(
    eventKey: string,
    target: { externalPlayerId: string } | { friendCode: string },
    opts: { idempotencyKey?: string; as?: string } = {},
  ): Promise<PartnerInvite> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'events.invitePartner');
    const env = await this.client.request<DataEnvelope<PartnerInvite>>(
      'POST',
      this.eventPath(externalPlayerId, eventKey, '/partners/invites'),
      { ...target, ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}) },
    );
    return env.data;
  }

  /** GET …/partners/invites: pending invites to you (`in`, default) or from you (`out`). */
  async partnerInvites(
    eventKey: string,
    opts: { direction?: 'in' | 'out'; as?: string } = {},
  ): Promise<PartnerInvite[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'events.partnerInvites');
    const env = await this.client.request<DataEnvelope<PartnerInvite[]>>(
      'GET',
      this.eventPath(externalPlayerId, eventKey, `/partners/invites?direction=${opts.direction ?? 'in'}`),
    );
    return env.data;
  }

  /** Accept an invite sent to you: the pair's bar goes live. */
  async acceptInvite(
    eventKey: string,
    eventTeamId: string,
    opts: { idempotencyKey?: string; as?: string } = {},
  ): Promise<PartnerInvite & { teams: TeamSeatView[] }> {
    return this.answerInvite<PartnerInvite & { teams: TeamSeatView[] }>(eventKey, eventTeamId, 'accept', opts);
  }

  /** Decline an invite sent to you (both slots free up). */
  async declineInvite(
    eventKey: string,
    eventTeamId: string,
    opts: { idempotencyKey?: string; as?: string } = {},
  ): Promise<PartnerInvite> {
    return this.answerInvite<PartnerInvite>(eventKey, eventTeamId, 'decline', opts);
  }

  /** Withdraw an invite you sent (both slots free up). */
  async cancelInvite(
    eventKey: string,
    eventTeamId: string,
    opts: { idempotencyKey?: string; as?: string } = {},
  ): Promise<PartnerInvite> {
    return this.answerInvite<PartnerInvite>(eventKey, eventTeamId, 'cancel', opts);
  }

  private async answerInvite<T>(
    eventKey: string,
    eventTeamId: string,
    action: 'accept' | 'decline' | 'cancel',
    opts: { idempotencyKey?: string; as?: string },
  ): Promise<T> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, `events.${action}Invite`);
    const env = await this.client.request<DataEnvelope<T>>(
      'POST',
      this.eventPath(
        externalPlayerId,
        eventKey,
        `/partners/invites/${encodeURIComponent(eventTeamId)}/${action}`,
      ),
      opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {},
    );
    return env.data;
  }

  /**
   * POST …/partners/random: pair with someone waiting for a random
   * partner, or open a bar that waits for one (solo after the event's
   * fallback time).
   */
  async randomPartner(
    eventKey: string,
    opts: { idempotencyKey?: string; as?: string } = {},
  ): Promise<RandomPartnerResult> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'events.randomPartner');
    const env = await this.client.request<DataEnvelope<RandomPartnerResult>>(
      'POST',
      this.eventPath(externalPlayerId, eventKey, '/partners/random'),
      opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {},
    );
    return env.data;
  }

  /** GET …/partners/suggestions: friends first, then recently active players with a free slot. */
  async partnerSuggestions(
    eventKey: string,
    opts: { limit?: number; as?: string } = {},
  ): Promise<PartnerSuggestion[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'events.partnerSuggestions');
    const qs = opts.limit !== undefined ? `?limit=${opts.limit}` : '';
    const env = await this.client.request<DataEnvelope<PartnerSuggestion[]>>(
      'GET',
      this.eventPath(externalPlayerId, eventKey, `/partners/suggestions${qs}`),
    );
    return env.data;
  }
}

/**
 * Resource client for `/sdk/v1/leaderboards/:key`, the
 * dashboard-configured cross-event leaderboards. Addressed by the
 * game-scoped `key` (e.g. `"weekly_global"`). For the auto-created
 * per-event-window boards addressed by UUID, see {@link EventLeaderboardsClient}.
 */
export class LeaderboardsClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET /sdk/v1/leaderboards: the game's configured boards (archived ones
   * left out), so the client can discover keys instead of hard-coding them.
   */
  async list(): Promise<LeaderboardSummary[]> {
    const env = await this.client.request<DataEnvelope<LeaderboardSummary[]>>(
      'GET',
      '/sdk/v1/leaderboards',
    );
    return env.data;
  }

  /**
   * GET /sdk/v1/leaderboards/:key: snapshot read of a
   * dashboard-configured cross-event leaderboard.
   *
   * `segment` is required only for `context`-segmented boards; pass
   * the same value your client supplied in
   * `playerContext[segmentation.key]` on attempt start. For
   * `progression`-segmented boards omit it; the server derives the
   * caller's division. Unsegmented boards ignore it.
   *
   * Pass `period: 'current'` (default) for live ranks, or an ISO
   * timestamp from `listPeriods(...)` for a historical snapshot.
   */
  async read(key: string, opts: LeaderboardReadOptions = {}): Promise<Leaderboard> {
    const params = new URLSearchParams();
    if (typeof opts.limit === 'number') params.set('limit', String(opts.limit));
    if (opts.progression?.length) params.set('progression', opts.progression.join(','));
    if (opts.segment) params.set('segment', opts.segment);
    if (opts.period) params.set('period', opts.period);
    if (opts.includeSelf) {
      params.set('includeSelf', 'true');
      const externalId =
        opts.externalId ?? (await this.client.ensureIdentity()).externalPlayerId;
      params.set('externalId', externalId);
    }
    const qs = params.toString();
    const path = qs
      ? `/sdk/v1/leaderboards/${encodeURIComponent(key)}?${qs}`
      : `/sdk/v1/leaderboards/${encodeURIComponent(key)}`;
    const env = await this.client.request<DataEnvelope<Leaderboard>>('GET', path);
    return env.data;
  }

  /**
   * POST /sdk/v1/players/:p/leaderboards/:key/score: submit a score
   * for the active player directly to a dashboard-configured board,
   * outside an event attempt. Returns the player's new score + rank.
   *
   * `segment` is required only for `context`-segmented boards (pass
   * the bucket value). For `progression`-segmented boards omit it;
   * the server derives the player's division; unsegmented boards
   * ignore it.
   *
   * Throws `KratyApiError`: `client_scoring_disabled` (403) when the
   * board is server-only, `score_not_supported` (400) on a
   * progression-ranked board, `not_found` (404), `validation_failed`
   * (400). Pass `{ as }` to address a different player (server-side
   * tooling only).
   */
  async submitScore(
    key: string,
    value: number,
    opts: { segment?: string; idempotencyKey?: string; as?: string } = {},
  ): Promise<LeaderboardScoreResult> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'leaderboards.submitScore');
    const body: { value: number; segment?: string; idempotencyKey?: string } = { value };
    if (opts.segment) body.segment = opts.segment;
    if (opts.idempotencyKey) body.idempotencyKey = opts.idempotencyKey;
    const env = await this.client.request<DataEnvelope<LeaderboardScoreResult>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/leaderboards/${encodeURIComponent(
        key,
      )}/score`,
      body,
    );
    return env.data;
  }

  /**
   * POST /sdk/v1/players/:p/leaderboards/:key/join: add the active
   * player to a configurable board at score 0 WITHOUT submitting a
   * score (they just "appear"), and return the current standings for
   * their segment. Idempotent, and never resets an existing score.
   *
   * `segment` is the bucket value for `context`-segmented boards;
   * derived server-side for `progression` boards. Pass `{ as }` to
   * address a different player (server-side tooling only).
   */
  async join(
    key: string,
    opts: { segment?: string; limit?: number; as?: string } = {},
  ): Promise<Leaderboard> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'leaderboards.join');
    const params = new URLSearchParams();
    if (typeof opts.limit === 'number') params.set('limit', String(opts.limit));
    const qs = params.toString();
    const body: { segment?: string } = {};
    if (opts.segment) body.segment = opts.segment;
    const base = `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/leaderboards/${encodeURIComponent(
      key,
    )}/join`;
    const env = await this.client.request<DataEnvelope<Leaderboard>>(
      'POST',
      qs ? `${base}?${qs}` : base,
      body,
    );
    return env.data;
  }

  /**
   * GET /sdk/v1/leaderboards/:key/standings: flexible multi-segment
   * read. Returns one block per segment (`scope` picks which), each
   * flagging the caller (`isSelf` on entries, `selfRank`, `participated`).
   * Works live (`period: 'current'`) or for a past period.
   *
   * Use this over `read(...)` when you want "my division", "every
   * division I'm in" (`scope: 'mine'`), or the whole ladder
   * (`scope: 'all'`). `self_segment`/`mine` resolve the caller from
   * `externalId` (or the SDK's active identity).
   */
  async standings(key: string, opts: StandingsReadOptions = {}): Promise<BoardStandings> {
    const scope = opts.scope ?? 'all';
    const params = new URLSearchParams();
    params.set('scope', scope);
    if (opts.segment) params.set('segment', opts.segment);
    if (opts.period) params.set('period', opts.period);
    if (typeof opts.limit === 'number') params.set('limit', String(opts.limit));
    if (typeof opts.maxSegments === 'number') params.set('maxSegments', String(opts.maxSegments));
    if (opts.progression?.length) params.set('progression', opts.progression.join(','));
    // self_segment / mine need a caller; auto-resolve the active
    // identity when the dev didn't pass one explicitly.
    let externalId = opts.externalId;
    if (!externalId && (scope === 'self_segment' || scope === 'mine')) {
      externalId = (await this.client.ensureIdentity()).externalPlayerId;
    }
    if (externalId) params.set('externalId', externalId);
    const env = await this.client.request<DataEnvelope<BoardStandings>>(
      'GET',
      `/sdk/v1/leaderboards/${encodeURIComponent(key)}/standings?${params.toString()}`,
    );
    return env.data;
  }

  /**
   * GET /sdk/v1/leaderboards/:key/periods
   *
   * Lists the available snapshot periods (newest first). Useful when
   * the UI offers "this week", "last week", "two weeks ago". Pick a
   * `periodStartedAt` from the result and re-call `read(key, { period })`.
   */
  async listPeriods(key: string, opts: { limit?: number } = {}): Promise<LeaderboardPeriods> {
    const params = new URLSearchParams();
    if (typeof opts.limit === 'number') params.set('limit', String(opts.limit));
    const qs = params.toString();
    const path = qs
      ? `/sdk/v1/leaderboards/${encodeURIComponent(key)}/periods?${qs}`
      : `/sdk/v1/leaderboards/${encodeURIComponent(key)}/periods`;
    const env = await this.client.request<DataEnvelope<LeaderboardPeriods>>('GET', path);
    return env.data;
  }
}

/**
 * Resource client for `/sdk/v1/event-leaderboards/:id`, the auto-generated
 * per-event-window leaderboard, addressed by the UUID
 * `events.start(...)` returns in `attempt.leaderboardId`. Includes
 * Server-Sent-Events live streaming. For the dashboard-configured
 * cross-event boards, see {@link LeaderboardsClient}.
 */
export class EventLeaderboardsClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET /sdk/v1/event-leaderboards/:id: top `limit` entries for one event
   * window's leaderboard. Pass `includeSelf: true` + `externalId` to
   * also receive the caller's rank/score.
   */
  async read(
    leaderboardId: string,
    opts: EventLeaderboardReadOptions = {},
  ): Promise<EventLeaderboard> {
    const params = new URLSearchParams();
    if (typeof opts.limit === 'number') params.set('limit', String(opts.limit));
    if (opts.progression?.length) params.set('progression', opts.progression.join(','));
    if (opts.includeSelf) {
      params.set('includeSelf', 'true');
      // Lazily resolve the active player when the dev didn't pass an
      // explicit `externalId`. Same contract as every other
      // player-scoped method on the SDK.
      const externalId =
        opts.externalId ?? (await this.client.ensureIdentity()).externalPlayerId;
      params.set('externalId', externalId);
    }
    const qs = params.toString();
    const path = qs
      ? `/sdk/v1/event-leaderboards/${encodeURIComponent(leaderboardId)}?${qs}`
      : `/sdk/v1/event-leaderboards/${encodeURIComponent(leaderboardId)}`;
    const env = await this.client.request<DataEnvelope<EventLeaderboard>>('GET', path);
    return env.data;
  }

  /**
   * POST /sdk/v1/players/:p/event-leaderboards/:id/join: add the
   * active player to a per-event-window board at score 0 WITHOUT
   * starting a scoring attempt, and return the current board.
   * Idempotent. Throws `KratyApiError` with `conflict` (409) once the
   * window has closed. Pass `{ as }` to address a different player.
   */
  async join(
    leaderboardId: string,
    opts: { limit?: number; as?: string } = {},
  ): Promise<EventLeaderboard> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'eventLeaderboards.join');
    const params = new URLSearchParams();
    if (typeof opts.limit === 'number') params.set('limit', String(opts.limit));
    const qs = params.toString();
    const base = `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/event-leaderboards/${encodeURIComponent(
      leaderboardId,
    )}/join`;
    const env = await this.client.request<DataEnvelope<EventLeaderboard>>(
      'POST',
      qs ? `${base}?${qs}` : base,
      {},
    );
    return env.data;
  }

  /**
   * GET /sdk/v1/event-leaderboards/:id/stream: opens a Server-Sent Events
   * subscription that pushes score updates in real time. Returns a
   * `LeaderboardStream` handle whose `events` async-iterable yields
   * each parsed event (`ready`, `score_update`, `closed`).
   *
   * Does NOT auto-reconnect on transport drop; the iterable throws
   * `KratyNetworkError` and you re-call `live(...)` after a backoff
   * if you want resumption.
   *
   * Low-level: prefer `subscribe(...)` for game UIs.
   */
  live(leaderboardId: string): Promise<LeaderboardStream> {
    return openLeaderboardStream({
      fetchImpl: this.client.fetchForStreaming,
      baseUrl: this.client.baseUrl,
      leaderboardId,
      authHeader: this.client.authHeader,
      playerSecret: this.client.playerSecret,
      sdkUserAgent: this.client.sdkUserAgent,
    });
  }

  /**
   * High-level live event-leaderboard subscription. Composes the
   * `live()` SSE stream with a periodic background `read()` poll that
   * nudges the server's lazy bot evaluator and dedupes the resulting
   * deltas against the SSE feed. Idle UIs need the poll so bots tick
   * on schedule even without player action; the SSE side carries the
   * resulting score updates with low latency.
   *
   * Callback fires for every event from either source, deduped so the
   * same `(participantId, score)` doesn't surface twice. Returns a
   * handle whose `close()` tears down both transports.
   *
   * @param leaderboardId  The event leaderboard UUID to subscribe to.
   * @param onEvent        Fired for every `LeaderboardStreamEvent`.
   * @param opts.pollIntervalMs  Background read cadence. Default 15_000.
   *                              Set to 0 to disable polling (SSE-only).
   * @param opts.onError   Optional; receives transport / parse errors.
   */
  subscribe(
    leaderboardId: string,
    onEvent: (event: LeaderboardStreamEvent) => void,
    opts: {
      pollIntervalMs?: number;
      onError?: (err: unknown) => void;
    } = {},
  ): { close: () => Promise<void> } {
    const pollIntervalMs = opts.pollIntervalMs ?? 15_000;
    const onError = opts.onError ?? (() => undefined);

    // Track the last score we surfaced for each participant so we can
    // suppress duplicates when SSE and a poll happen to deliver the
    // same delta. Players who replay the same score get suppressed too,
    // which matches what game UIs want (no re-render churn).
    const lastSurfacedScore = new Map<string, number>();
    let closed = false;
    let streamHandle: LeaderboardStream | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const surface = (event: LeaderboardStreamEvent): void => {
      if (closed) return;
      // For score_update events, dedupe by (participantId, score). Other
      // event kinds (ready, closed, parse-error) always pass through.
      if (event.kind === 'score_update') {
        const pid = String(event.data['participantId'] ?? '');
        const score = Number(event.data['score']);
        if (pid && Number.isFinite(score)) {
          const prior = lastSurfacedScore.get(pid);
          if (prior === score) return;
          lastSurfacedScore.set(pid, score);
        }
      }
      // Route finalizations into the tracker's single writer (docs/05b) so a
      // live `finalized` persists to the registry + fires onFinalized, exactly
      // like catch-up would. Fire-and-forget; independent of the app's onEvent.
      if (event.kind === 'finalized') {
        void this.client
          .routeFinalized(leaderboardId, event.data as { reason?: string })
          .catch(() => undefined);
      }
      try {
        onEvent(event);
      } catch (err) {
        try { onError(err); } catch { /* swallow */ }
      }
    };

    const consumeSse = async (): Promise<void> => {
      let handle: LeaderboardStream;
      try {
        handle = await this.live(leaderboardId);
      } catch (err) {
        if (!closed) {
          try { onError(err); } catch { /* swallow */ }
        }
        return;
      }
      // close() ran while the stream was still connecting, so it had no
      // handle to abort. Close it now or the HTTP connection stays open
      // forever (browsers cap connections per host, so a few leaks starve
      // every other request; React StrictMode's mount/unmount/mount hits
      // this on every subscribe).
      if (closed) {
        try { await handle.close(); } catch { /* swallow */ }
        return;
      }
      streamHandle = handle;
      try {
        for await (const ev of streamHandle.events) {
          surface(ev);
        }
      } catch (err) {
        if (!closed) {
          try { onError(err); } catch { /* swallow */ }
        }
      }
    };

    const consumePollOnce = async (): Promise<void> => {
      if (closed) return;
      try {
        const lb = await this.read(leaderboardId);
        for (const entry of lb.entries) {
          surface({
            kind: 'score_update',
            data: {
              leaderboardId: lb.leaderboardId,
              participantId: entry.participantId,
              score: entry.score,
              rank: entry.rank,
            },
          });
        }
      } catch (err) {
        try { onError(err); } catch { /* swallow */ }
      }
    };

    const schedulePoll = (): void => {
      if (closed || pollIntervalMs <= 0) return;
      pollTimer = setTimeout(async () => {
        await consumePollOnce();
        schedulePoll();
      }, pollIntervalMs);
    };

    // Kick off both transports in parallel. Poll fires once immediately
    // so the first frame of the UI lands with current scores; SSE wires
    // up alongside for low-latency real-time pushes.
    void consumeSse();
    if (pollIntervalMs > 0) {
      void consumePollOnce().then(schedulePoll);
    }

    return {
      close: async () => {
        if (closed) return;
        closed = true;
        if (pollTimer) clearTimeout(pollTimer);
        if (streamHandle) {
          try { await streamHandle.close(); } catch { /* swallow */ }
        }
      },
    };
  }
}

export class GrantsClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET /sdk/v1/players/:p/pending-grants: the active player's
   * unclaimed grants. Empty array for unknown players (not 404).
   * Pass `{ as }` to query another player (server tooling only).
   */
  async listPending(opts: { limit?: number; as?: string } = {}): Promise<Grant[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'grants.listPending');
    const qs = typeof opts.limit === 'number' ? `?limit=${opts.limit}` : '';
    const env = await this.client.request<DataEnvelope<Grant[]>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/pending-grants${qs}`,
    );
    return env.data;
  }

  /**
   * POST /sdk/v1/players/:p/grants: grant items / currency / a crate to
   * the ACTIVE player. Self-only — the player secret means you can only
   * grant to yourself, never another player.
   *
   * Requires the game's inventory management to be **permissive**; any
   * other mode fails with a 403 (`inventory_not_permissive`). In permissive
   * mode the grant auto-deposits into the player's holdings, so you can read
   * it straight back with `inventory.list()` / `inventory.wallet()`.
   *
   * @example
   * await kraty.grants.grant({ entries: [{ type: 'item', itemKey: 'gold_sword', quantity: 1 }] });
   */
  async grant(input: GrantSelfInput, opts: { as?: string } = {}): Promise<Grant> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'grants.grant');
    const env = await this.client.request<DataEnvelope<Grant>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/grants`,
      input,
    );
    return env.data;
  }

  /**
   * POST /sdk/v1/players/:p/grants/:g/claim: flip a pending grant
   * to claimed for the active player. Idempotent: claiming an
   * already-claimed grant returns the same row with 200.
   */
  async claim(grantId: string, opts: { as?: string } = {}): Promise<Grant> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'grants.claim');
    const env = await this.client.request<DataEnvelope<Grant>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/grants/${encodeURIComponent(
        grantId,
      )}/claim`,
      {},
    );
    return env.data;
  }

  /**
   * POST /sdk/v1/players/:p/crates/:g/open: roll the crate's reward
   * table for the active player and return both the crate (now
   * claimed) and the contents grant. Idempotent on the crate id.
   */
  async open(grantId: string, opts: { as?: string } = {}): Promise<OpenCrateResponse> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'grants.open');
    const env = await this.client.request<DataEnvelope<OpenCrateResponse>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/crates/${encodeURIComponent(
        grantId,
      )}/open`,
      {},
    );
    return env.data;
  }

  /**
   * Burn down the pending-grants queue in one call: list everything
   * pending, open every crate, claim every reward, return a summary.
   * Built for the "round complete" reward-collection moment most
   * games have.
   *
   * Errors per-grant are caught and surfaced in
   * `CollectAllResult.failures`, so one bad grant doesn't abort the
   * whole sweep. Crates open BEFORE rewards are claimed, so the
   * rolled-contents grant a crate produces lands in the NEXT
   * `listPending`, so re-invoke if you want to drain those too.
   */
  async collectAll(opts: { as?: string } = {}): Promise<CollectAllResult> {
    const pending = await this.listPending(opts);
    const opened: OpenCrateResponse[] = [];
    const claimed: Grant[] = [];
    const failures: CollectAllFailure[] = [];
    for (const g of pending) {
      try {
        if (g.kind === 'crate') {
          opened.push(await this.open(g.id, opts));
        } else {
          claimed.push(await this.claim(g.id, opts));
        }
      } catch (err) {
        failures.push({ grant: g, error: err });
      }
    }
    return {
      processed: pending.length,
      opened,
      claimed,
      failures,
      hasFailures: failures.length > 0,
    };
  }
}

/**
 * One pending grant that `collectAll` couldn't process. The other
 * grants in the same sweep still went through; inspect `error` and
 * retry the individual operation.
 */
export interface CollectAllFailure {
  grant: Grant;
  error: unknown;
}

/**
 * Aggregate result of `GrantsClient.collectAll`. `processed` is the
 * total pending count at the time of the call; `opened` + `claimed`
 * + `failures` sum to that.
 */
export interface CollectAllResult {
  processed: number;
  opened: OpenCrateResponse[];
  claimed: Grant[];
  failures: CollectAllFailure[];
  hasFailures: boolean;
}

/**
 * Resource client for `/sdk/v1/players/:p/inventory(/...)`. Only
 * surfaces meaningful data for games whose
 * `settings.inventoryManagement === 'platform'`. The SDK doesn't
 * expose grant / admin-credit endpoints; those are server-API only.
 */
/**
 * Real-money purchase reporting.
 *
 * Deliberately WRITE-ONLY. There is no client-side read of a player's
 * spend total: it is a monetization signal worth keeping out of a
 * shipped binary, and games that gate content on spend don't need it —
 * the backend evaluates a `spend_at_least` unlock condition server-side
 * and the event simply arrives locked or unlocked. Studios that want
 * the number for their own UI read it through their backend
 * (`GET /server/v1/players/:id/spend`).
 */
export class PurchasesClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * POST /sdk/v1/players/:p/purchases: record a real-money purchase
   * for the active player.
   *
   * Call it the moment your store SDK confirms the transaction. Safe to
   * call repeatedly for the same `transactionId` — restores,
   * retries-after-timeout, and app relaunches all collapse onto one
   * ledger row, and the result's `deduplicated` flag tells you which
   * happened. That means you can call it unconditionally on every
   * restore without tracking what you've already reported.
   *
   * ```ts
   * const result = await kraty.trackPurchase({
   *   // Google Play: the `orderId` (`GPA.…`), the same id your server reports.
   *   transactionId: canonicalTransactionId({ store: 'google_play', orderId: storeTx.orderId }),
   *   store: 'google_play',
   *   productId: 'com.studio.game.gems_500',
   *   productType: 'consumable',
   *   amountMinor: 2990,      // R$29.90 — minor units, as charged
   *   currency: 'BRL',
   *   receipt: storeTx.purchaseToken,
   * });
   * // result.normalizedAmountMinor === 520  ($5.20)
   * ```
   *
   * Throws `KratyApiError` with code `unknown_currency` if Kraty holds
   * no FX rate for `currency`. That is a configuration gap rather than
   * a player problem — surface it in QA, don't retry.
   */
  async track(
    input: TrackPurchaseInput,
    opts: { as?: string } = {},
  ): Promise<TrackPurchaseResult> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'purchases.track');
    const env = await this.client.request<DataEnvelope<TrackPurchaseResult>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/purchases`,
      input,
    );
    return env.data;
  }
}

export class InventoryClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET /sdk/v1/players/:p/inventory: every item the active player
   * currently holds. Backend wraps as `{ data: { items: [...] } }`.
   */
  async list(opts: { as?: string } = {}): Promise<PlayerItemHolding[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'inventory.list');
    const env = await this.client.request<DataEnvelope<{ items?: PlayerItemHolding[] }>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/inventory`,
    );
    return env.data?.items ?? [];
  }

  /**
   * POST /sdk/v1/players/:p/inventory/:itemKey/consume: atomic
   * decrement for the active player. Auto-stamped idempotency key
   * unless you provide one. Throws `KratyApiError` with code
   * `conflict` if the player doesn't have enough of the item.
   */
  async consume(
    itemKey: string,
    input: ConsumeItemInput,
    opts: { as?: string } = {},
  ): Promise<ConsumeItemResult> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'inventory.consume');
    const env = await this.client.request<DataEnvelope<ConsumeItemResult>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/inventory/${encodeURIComponent(
        itemKey,
      )}/consume`,
      input,
    );
    return env.data;
  }

  /**
   * GET `/inventory/stream`: live subscription to everything that touches
   * this player's items, wallet, and grants — whoever caused it. A reward
   * granted from the dashboard, a currency credited by the studio's
   * backend, an event payout, and the client's own consume all arrive here.
   *
   * Returns the raw stream handle. Iterate `events` and call `close()` when
   * done; see {@link InventoryClient.watch} for the callback form.
   *
   * ```ts
   * const stream = await kraty.inventory.live();
   * for await (const ev of stream.events) {
   *   if (ev.kind === 'inventory_changed') refreshBackpack();
   * }
   * ```
   *
   * Does NOT auto-reconnect: re-call after a backoff if the iterable throws.
   * Treat every event as "refresh this"; the REST reads stay authoritative.
   */
  async live(opts: { as?: string } = {}): Promise<InventoryStream> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'inventory.live');
    return openInventoryStream({
      fetchImpl: this.client.fetchForStreaming,
      baseUrl: this.client.baseUrl,
      externalPlayerId,
      authHeader: this.client.authHeader,
      playerSecret: this.client.playerSecret,
      sdkUserAgent: this.client.sdkUserAgent,
    });
  }

  /**
   * Callback form of {@link InventoryClient.live}: the one-liner most games
   * want.
   *
   * ```ts
   * const stop = await kraty.inventory.watch((ev) => {
   *   if (ev.kind === 'grant_created') showRewardPopup(ev.contents);
   * });
   * // later
   * await stop();
   * ```
   *
   * Pass `ignoreOwnWrites: true` to skip events the client itself caused
   * (`origin: 'client'`), so a consume doesn't bounce back as a refresh.
   * `onError` receives transport failures; the subscription is finished by
   * the time it fires, so reconnect from there if you want resumption.
   * Returns a stop function; calling it more than once is safe.
   */
  async watch(
    handler: (event: InventoryStreamEvent) => void,
    opts: {
      ignoreOwnWrites?: boolean;
      onError?: (err: unknown) => void;
      as?: string;
    } = {},
  ): Promise<() => Promise<void>> {
    const stream = await this.live(opts.as ? { as: opts.as } : {});
    void (async () => {
      try {
        for await (const ev of stream.events) {
          if (
            opts.ignoreOwnWrites &&
            'origin' in ev &&
            (ev as { origin?: string }).origin === 'client'
          ) {
            continue;
          }
          handler(ev);
        }
      } catch (err) {
        opts.onError?.(err);
      }
    })();
    return () => stream.close();
  }
}

/**
 * Resource client for `/sdk/v1/players/:p/wallet(/...)`. Mirrors
 * `InventoryClient` for currencies + progression resources.
 */
export class WalletClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET /sdk/v1/players/:p/wallet: every economy entry the player
   * has touched. Backend wraps as `{ data: { wallet: [...] } }`.
   */
  async list(opts: { as?: string } = {}): Promise<PlayerWalletHolding[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'wallet.list');
    const env = await this.client.request<DataEnvelope<{ wallet?: PlayerWalletHolding[] }>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/wallet`,
    );
    return env.data?.wallet ?? [];
  }

  /**
   * POST /sdk/v1/players/:p/wallet/:economyKey/debit: atomic
   * decrement on the active player's wallet. 409 on insufficient
   * balance. Credit is intentionally not exposed here; only the
   * studio's backend can mint balance.
   */
  async debit(
    economyKey: string,
    input: DebitWalletInput,
    opts: { as?: string } = {},
  ): Promise<DebitWalletResult> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'wallet.debit');
    const env = await this.client.request<DataEnvelope<DebitWalletResult>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/wallet/${encodeURIComponent(
        economyKey,
      )}/debit`,
      input,
    );
    return env.data;
  }

  /**
   * POST /sdk/v1/players/:p/wallet/:economyKey/progress: push progress
   * into a **progression** resource straight from the game client — XP
   * from a finished run, distance travelled, stars collected — with no
   * studio backend in the loop.
   *
   * The resource must be `kind: 'progression'` AND flagged
   * **client-writable** in the dashboard; otherwise the call fails 403.
   * Spendable currencies are never client-writable.
   *
   * Anything derived from this resource moves with it in the same
   * transaction, and each level crossed pays its configured reward, so a
   * single call can come back with `derived: [{ economyKey: 'level',
   * previous: 3, current: 5, grantIds: [...] }]` — enough to render
   * "Level 5!" and the reward popup without a second request.
   */
  async progress(
    economyKey: string,
    input: ProgressWalletInput,
    opts: { as?: string } = {},
  ): Promise<ProgressWalletResult> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'wallet.progress');
    const env = await this.client.request<DataEnvelope<ProgressWalletResult>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/wallet/${encodeURIComponent(
        economyKey,
      )}/progress`,
      input,
    );
    return { ...env.data, derived: env.data?.derived ?? [] };
  }
}

/**
 * Resource client for `/sdk/v1/players/:p/register`, the zero-trust
 * bootstrap. Game client calls `register()` once on first launch
 * (or after the player wipes app data), captures the returned
 * `secret`, persists it locally, and re-creates the `KratyClient`
 * with `playerSecret: <secret>`.
 */
export class PlayersClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * POST /sdk/v1/players/:externalId/register: creates the player
   * row if it doesn't exist + mints a per-player secret. Throws
   * `KratyApiError` with `isPlayerAlreadyRegistered` true if the
   * player has already claimed a secret.
   *
   * Pass `force: true` to ROTATE an existing secret. Only honoured
   * by non-`live` API keys (dev/test/staging). Useful in the "I
   * wiped my app data and need to re-register" flow during testing.
   * Never wire this up in a production client.
   */
  async register(
    externalPlayerId: string,
    opts: { force?: boolean } = {},
  ): Promise<PlayerRegistration> {
    const path = opts.force
      ? `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/register?force=true`
      : `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/register`;
    const env = await this.client.request<DataEnvelope<PlayerRegistration>>('POST', path, {});
    return env.data;
  }

  /**
   * PUT /sdk/v1/players/:externalId/identity: set the active player's OWN
   * display name (+ optional avatar) — e.g. from a "choose your username"
   * screen. Overrides the identity auto-generated from the game's pool and
   * surfaces on leaderboards and in `kraty.syntheticIdentity`.
   *
   * Authorized by the player's own secret, so a client can only ever change
   * ITS OWN identity. This trusts the client: if you need to moderate names,
   * set them from your backend (server SDK `players.setIdentity`) instead.
   *
   * Pass `avatar: null` (or omit) to clear the avatar. `{ as }` targets
   * another player (server-side tooling only). Throws `KratyApiError`
   * `validation_failed` (400) on an empty or over-long name.
   */
  async setIdentity(
    identity: { name: string; avatar?: string | null },
    opts: { as?: string } = {},
  ): Promise<PlayerIdentity | null> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'players.setIdentity');
    const body: { name: string; avatar?: string | null } = { name: identity.name };
    if (identity.avatar !== undefined) body.avatar = identity.avatar;
    const env = await this.client.request<
      DataEnvelope<{
        externalPlayerId: string;
        displayIdentity: PlayerIdentity | null;
        anonymizedIdentity: PlayerIdentity | null;
      }>
    >('PUT', `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/identity`, body);
    // Keep the local cache in sync so `kraty.syntheticIdentity` reflects the
    // anonymized value immediately without a re-register round-trip.
    if (env.data.anonymizedIdentity) {
      this.client.setSyntheticIdentity({
        name: env.data.anonymizedIdentity.name,
        avatar: env.data.anonymizedIdentity.avatar ?? null,
      });
    }
    return env.data.displayIdentity;
  }

  /**
   * The player's REAL display identity — what `setIdentity` writes, falling
   * back to the anonymized pool value when they've never renamed themselves.
   * Includes the server-resolved `country`. Use this when rendering a
   * self-facing surface where the real name should show if the player picked
   * one; use [[getAnonymizedIdentity]] for public / privacy-preserving views.
   *
   * By default resolves the calling player's own identity. Pass `{ as }` to
   * look up another player (requires an externalId your client can already
   * see — this route reads the same public identity envelope every
   * leaderboard entry carries).
   */
  async getIdentity(opts: { as?: string } = {}): Promise<PlayerIdentity | null> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'players.getIdentity');
    const env = await this.client.request<
      DataEnvelope<{ displayIdentity: PlayerIdentity | null }>
    >('GET', `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/identity`);
    return env.data.displayIdentity;
  }

  /**
   * The player's ANONYMIZED identity — always the immutable synthetic-pool
   * value plus `country`, regardless of any `setIdentity` overrides. Use
   * this when rendering public leaderboards or any surface where the real
   * name shouldn't leak. Pair with [[getIdentity]] for the "real name if
   * set, anonymized otherwise" flow.
   */
  async getAnonymizedIdentity(opts: { as?: string } = {}): Promise<PlayerIdentity | null> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'players.getAnonymizedIdentity');
    const env = await this.client.request<
      DataEnvelope<{ anonymizedIdentity: PlayerIdentity | null }>
    >('GET', `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/identity`);
    return env.data.anonymizedIdentity;
  }

  /**
   * PUT `/sdk/v1/players/:externalId/metadata`: REPLACE the calling
   * player's free-form metadata bag wholesale. Studio-defined keys —
   * anything the platform's own model doesn't cover (VIP flag, gender,
   * preferred language, cohort, whatever). Surfaced on every
   * leaderboard entry as `entry.player.metadata` so game code can
   * render metadata-aware UI (VIP crowns, etc.) without a second lookup.
   *
   * Use [[mergeMetadata]] if you only want to update a subset of keys
   * without losing the others.
   *
   * Authorized by the player's own secret — clients can only ever
   * change their OWN metadata. Studios that need to moderate the
   * payload should set metadata from their backend via the server SDK
   * `players.setMetadata` instead.
   */
  async setMetadata(
    metadata: Record<string, unknown>,
    opts: { as?: string } = {},
  ): Promise<Record<string, unknown>> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'players.setMetadata');
    const env = await this.client.request<
      DataEnvelope<{ externalPlayerId: string; metadata: Record<string, unknown> }>
    >('PUT', `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/metadata`, metadata);
    return env.data.metadata;
  }

  /**
   * PATCH `/sdk/v1/players/:externalId/metadata`: shallow-merge `patch`
   * into the calling player's existing metadata. Keys present in
   * `patch` overwrite; keys absent stay untouched. Use this for one-off
   * updates (`{ vip: true }`) instead of the full-replace [[setMetadata]].
   */
  async mergeMetadata(
    patch: Record<string, unknown>,
    opts: { as?: string } = {},
  ): Promise<Record<string, unknown>> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'players.mergeMetadata');
    const env = await this.client.request<
      DataEnvelope<{ externalPlayerId: string; metadata: Record<string, unknown> }>
    >('PATCH', `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/metadata`, patch);
    return env.data.metadata;
  }
}

/**
 * Resource client for the player social graph, under
 * `/sdk/v1/players/:externalId/...`: friend codes, requests, the
 * friends list with live presence, username search, and blocking.
 *
 * Every method is authorized by the active player's own secret, so a
 * client can only ever act on ITS OWN social graph — friends are always
 * scoped to the same game + environment. Pass `{ as }` on any method to
 * address a different player (server-side tooling only).
 */
/**
 * `?progression=level,trophies` for the social-graph reads. Every friends
 * endpoint accepts it and attaches those balances to each returned player,
 * so a friends list can render "Lv 12" without an extra call per friend.
 * Which key means "level" is per-game, which is why it's a parameter and
 * not a fixed field.
 */
function giftQuery(opts: { pendingOnly?: boolean; limit?: number }): string {
  const params = new URLSearchParams();
  if (opts.pendingOnly) params.set('status', 'pending');
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const query = params.toString();
  return query ? `?${query}` : '';
}

function progressionQuery(keys: string[] | undefined): string {
  if (!keys || keys.length === 0) return '';
  return `?progression=${encodeURIComponent(keys.join(','))}`;
}

export class FriendsClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET `/friend-code`: the caller's short, shareable friend code
   * (6 chars, unambiguous alphabet), generated on first use and stable
   * forever after. Share it out-of-band so a friend can `add` you
   * without a username search.
   */
  async getCode(opts: { progression?: string[]; as?: string } = {}): Promise<FriendCode> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.getCode');
    const env = await this.client.request<DataEnvelope<FriendCode>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friend-code${progressionQuery(
        opts.progression,
      )}`,
    );
    return env.data;
  }

  /**
   * POST `/presence`: refresh the caller's online status. Call every
   * ~30s while the player is active; presence expires automatically when
   * heartbeats stop. Optionally set a free-form `status` label
   * ("in_match", "lobby", …) that friends see. Pass `status: null` to
   * clear it.
   */
  async heartbeat(
    opts: { status?: string | null; as?: string } = {},
  ): Promise<PlayerPresence> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.heartbeat');
    const body: { status?: string | null } = {};
    if (opts.status !== undefined) body.status = opts.status;
    const env = await this.client.request<DataEnvelope<PlayerPresence>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/presence`,
      body,
    );
    return env.data;
  }

  /**
   * GET `/friends`: the caller's accepted friends, each enriched with
   * display identity and live presence (online / last-active / status).
   */
  async list(opts: { progression?: string[]; as?: string } = {}): Promise<Friend[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.list');
    const env = await this.client.request<DataEnvelope<{ friends: Friend[] }>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends${progressionQuery(
        opts.progression,
      )}`,
    );
    return env.data.friends;
  }

  /**
   * GET `/friends/search?q=`: find other players by display name within
   * the same game + environment. Each hit reports the caller's
   * relationship to that player; blocked players are omitted.
   */
  async search(
    query: string,
    opts: { limit?: number; progression?: string[]; as?: string } = {},
  ): Promise<FriendSearchResult[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.search');
    const params = new URLSearchParams({ q: query });
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.progression?.length) params.set('progression', opts.progression.join(','));
    const env = await this.client.request<DataEnvelope<{ results: FriendSearchResult[] }>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/search?${params.toString()}`,
    );
    return env.data.results;
  }

  /**
   * GET `/friends/suggestions`: "people you may want to add" — recently-active
   * players in the same game + environment the caller isn't already related to
   * (not a friend, no pending request either way, not blocked). Returns a
   * weighted-random sample biased toward the most recently active, so calling
   * it again surfaces a different set. `limit` defaults to 5 (clamped 1–25).
   */
  async suggestions(
    opts: { limit?: number; progression?: string[]; as?: string } = {},
  ): Promise<Suggestion[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.suggestions');
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.progression?.length) params.set('progression', opts.progression.join(','));
    const qs = params.toString();
    const env = await this.client.request<DataEnvelope<{ suggestions: Suggestion[] }>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/suggestions${
        qs ? `?${qs}` : ''
      }`,
    );
    return env.data.suggestions;
  }

  /**
   * GET `/friends/requests`: the caller's pending incoming + outgoing
   * friend requests.
   */
  async listRequests(opts: { progression?: string[]; as?: string } = {}): Promise<FriendRequests> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.listRequests');
    const env = await this.client.request<DataEnvelope<FriendRequests>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/requests${progressionQuery(
        opts.progression,
      )}`,
    );
    return env.data;
  }

  /**
   * POST `/friends/requests`: add another player by `friendCode` or
   * `externalPlayerId` (exactly one). Creates a pending request they must
   * accept — unless they had already requested the caller, in which case
   * the friendship is accepted immediately (`status: 'accepted'`).
   * Throws `KratyApiError` on `player_blocked` (403), `already_friends`
   * (409), `cannot_friend_self` (400), or `friend_code_invalid` (404).
   */
  async add(target: FriendTarget, opts: { as?: string } = {}): Promise<SendFriendRequestResult> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.add');
    const env = await this.client.request<DataEnvelope<SendFriendRequestResult>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/requests`,
      target,
    );
    return env.data;
  }

  /** POST `/friends/requests/:id/accept`: accept an incoming request. */
  async accept(requestId: string, opts: { as?: string } = {}): Promise<Friend> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.accept');
    const env = await this.client.request<DataEnvelope<{ friend: Friend }>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/requests/${encodeURIComponent(requestId)}/accept`,
      {},
    );
    return env.data.friend;
  }

  /** POST `/friends/requests/:id/decline`: decline an incoming request. */
  async decline(requestId: string, opts: { as?: string } = {}): Promise<void> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.decline');
    await this.client.request<DataEnvelope<{ declined: boolean }>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/requests/${encodeURIComponent(requestId)}/decline`,
      {},
    );
  }

  /** DELETE `/friends/requests/:id`: cancel an outgoing request. */
  async cancelRequest(requestId: string, opts: { as?: string } = {}): Promise<void> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.cancelRequest');
    await this.client.request<DataEnvelope<{ cancelled: boolean }>>(
      'DELETE',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/requests/${encodeURIComponent(requestId)}`,
    );
  }

  /** DELETE `/friends/:friendExternalId`: remove an existing friend. */
  async remove(friendExternalId: string, opts: { as?: string } = {}): Promise<void> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.remove');
    await this.client.request<DataEnvelope<{ removed: boolean }>>(
      'DELETE',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/${encodeURIComponent(friendExternalId)}`,
    );
  }

  /** GET `/blocks`: the players the caller has blocked. */
  async listBlocks(opts: { as?: string } = {}): Promise<BlockedPlayer[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.listBlocks');
    const env = await this.client.request<DataEnvelope<{ blocked: BlockedPlayer[] }>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/blocks`,
    );
    return env.data.blocked;
  }

  /**
   * POST `/blocks`: block a player by `friendCode` or `externalPlayerId`.
   * Tears down any friendship / pending request between the two and hides
   * each from the other's search + presence.
   */
  async block(target: FriendTarget, opts: { as?: string } = {}): Promise<BlockedPlayer> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.block');
    const env = await this.client.request<DataEnvelope<{ blocked: BlockedPlayer }>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/blocks`,
      target,
    );
    return env.data.blocked;
  }

  /** DELETE `/blocks/:blockedExternalId`: unblock a player. */
  async unblock(blockedExternalId: string, opts: { as?: string } = {}): Promise<void> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.unblock');
    await this.client.request<DataEnvelope<{ unblocked: boolean }>>(
      'DELETE',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/blocks/${encodeURIComponent(blockedExternalId)}`,
    );
  }

  // ── Gifting ──────────────────────────────────────────────────────────

  /**
   * GET `/friends/gifts/catalog`: what this player may gift and how often.
   *
   * Returns the studio's allowlist (every catalog row flagged giftable in
   * the dashboard) plus the game's cooldown / daily-limit config, so a gift
   * picker can be built entirely from server config. `type: 'currency'`
   * entries include progression items like XP.
   *
   * Throws `403 gifting_disabled` when the game hasn't enabled gifting.
   */
  async giftCatalog(opts: { as?: string } = {}): Promise<GiftCatalog> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.giftCatalog');
    const env = await this.client.request<DataEnvelope<GiftCatalog>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/gifts/catalog`,
    );
    return env.data;
  }

  /**
   * POST `/friends/gifts`: send a gift to an accepted friend.
   *
   * The catalog decides what can travel and how much of it; if the resource
   * is configured to cost the sender, their balance is debited in the same
   * transaction. The recipient gets a PENDING grant that stays unopened
   * until they call {@link claimGift}.
   *
   * Pass `idempotencyKey` so a retry returns the original gift instead of
   * failing the per-friend cooldown.
   */
  async sendGift(input: SendGiftInput, opts: { as?: string } = {}): Promise<Gift> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.sendGift');
    const { to, ...rest } = input;
    const env = await this.client.request<DataEnvelope<{ gift: Gift }>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/gifts`,
      { ...to, ...rest },
    );
    return env.data.gift;
  }

  /**
   * GET `/friends/gifts`: the player's gift inbox, newest first.
   * `{ pendingOnly: true }` narrows it to gifts still waiting to be claimed.
   */
  async gifts(
    opts: { pendingOnly?: boolean; limit?: number; as?: string } = {},
  ): Promise<Gift[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.gifts');
    const env = await this.client.request<DataEnvelope<{ gifts: Gift[] }>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/gifts${giftQuery(opts)}`,
    );
    return env.data.gifts;
  }

  /** GET `/friends/gifts/sent`: gifts this player has sent, newest first. */
  async sentGifts(
    opts: { pendingOnly?: boolean; limit?: number; as?: string } = {},
  ): Promise<Gift[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.sentGifts');
    const env = await this.client.request<DataEnvelope<{ gifts: Gift[] }>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/gifts/sent${giftQuery(opts)}`,
    );
    return env.data.gifts;
  }

  /**
   * POST `/friends/gifts/:giftId/claim`: claim a received gift.
   *
   * This is where a gift actually pays out — the delivering grant defers its
   * deposit to claim time so an unopened gift is genuinely unopened. Replays
   * on an already-claimed gift return the same row.
   */
  async claimGift(giftId: string, opts: { as?: string } = {}): Promise<Gift> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.claimGift');
    const env = await this.client.request<DataEnvelope<{ gift: Gift }>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/gifts/${encodeURIComponent(giftId)}/claim`,
    );
    return env.data.gift;
  }
}

/**
 * Resource client for `/sdk/v1/catalog`: single-shot read of every
 * item + currency configured for the game. Studios call this once at
 * boot and cache locally; pairs with `events.listForPlayer` (which
 * inlines reward-bundle previews) so a UI can render names, icons,
 * rarities, and reward previews without keeping a parallel catalog
 * in the client codebase.
 */
export class CatalogClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET `/sdk/v1/catalog`: items + currencies for the calling game.
   * Game is derived from the API key; no parameters.
   */
  async read(): Promise<Catalog> {
    const env = await this.client.request<DataEnvelope<Catalog>>(
      'GET',
      '/sdk/v1/catalog',
    );
    return env.data;
  }
}

/**
 * Resource client for `/sdk/v1/players/:p/daily-login`: the game's daily
 * login calendar. Read-only; the server pays each day's reward on the
 * player's first session of that UTC day (a call on first contact or after
 * 30 minutes of silence opens one), as a grant with
 * `sourceKind: 'daily_login'`.
 */
export class DailyLoginClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET `/sdk/v1/players/:p/daily-login`. Resolves to `null` when the game
   * has no calendar or it is switched off for this key's environment.
   * When this request is the one that opens a session, today is already
   * paid in the result; a player still in a session from before midnight
   * UTC is paid on their next one.
   */
  async read(opts: { as?: string } = {}): Promise<DailyLogin | null> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'dailyLogin.read');
    const env = await this.client.request<DataEnvelope<DailyLogin | null>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/daily-login`,
    );
    return env.data ?? null;
  }
}

/**
 * Resource client for `/sdk/v1/players/:p/offers` (docs/26): real-money
 * offers such as starter packs, bundles and chains.
 *
 * The flow: `list()` what to show; `markShown()` when an offer is actually
 * on screen (that starts a "from first shown" timer, so don't call it for
 * offers you only prefetched); sell `offer.current.skus[<your store>]`;
 * then report the store transaction with `kraty.trackPurchase({ …,
 * offerInstanceId: offer.instanceId })`. When the result's
 * `offer.studioFulfils` is true (the offer is set to game delivers; by default Kraty delivers, so do not grant it too), deliver `offer.contents`
 * yourself, as you fulfil any IAP.
 */
export class OffersClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET `/sdk/v1/players/:p/offers`: the offers to show now, highest
   * priority first. `level` is the player's current level, for offers that
   * trigger on reaching one. Listing is not an impression.
   */
  async list(opts: { limit?: number; level?: number; as?: string } = {}): Promise<Offer[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'offers.list');
    const query = new URLSearchParams();
    if (opts.limit !== undefined) query.set('limit', String(opts.limit));
    if (opts.level !== undefined) query.set('level', String(opts.level));
    const qs = query.toString();
    const env = await this.client.request<DataEnvelope<Offer[]>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/offers${qs ? `?${qs}` : ''}`,
    );
    return env.data;
  }

  /**
   * POST `…/offers/:instanceId/impression`: the offer is on screen now.
   * Idempotent (the SDK generates the key when you don't pass one).
   * `capped: true` when a cap refused it: respect it and don't show the
   * offer. `cappedReason` says which (`offer_*` = the offer's own caps,
   * `global_*` = the game-wide fatigue caps) and `retryAt` when it could
   * pass (the gap between two offers, or the next UTC midnight). Re-rendering
   * an offer already shown this session is never refused by the game-wide
   * caps.
   */
  async markShown(
    instanceId: string,
    opts: { idempotencyKey?: string; as?: string } = {},
  ): Promise<OfferImpressionResult> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'offers.markShown');
    const env = await this.client.request<DataEnvelope<OfferImpressionResult>>(
      'POST',
      this.instancePath(externalPlayerId, instanceId, '/impression'),
      opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {},
    );
    return env.data;
  }

  /** POST `…/offers/:instanceId/dismiss`: the player closed the offer without buying. */
  async dismiss(
    instanceId: string,
    opts: { idempotencyKey?: string; as?: string } = {},
  ): Promise<Offer> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'offers.dismiss');
    const env = await this.client.request<DataEnvelope<Offer>>(
      'POST',
      this.instancePath(externalPlayerId, instanceId, '/dismiss'),
      opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {},
    );
    return env.data;
  }

  /**
   * POST `…/offers/triggers`: report a fail, a depleted resource or a level
   * so the offers listening to it arm. Answers the newly armed offers that
   * can be shown now (`offers: []` when none did; they also show up on the
   * next `list`). Idempotent (the SDK generates the key when you don't pass
   * one). `playerContext` feeds offer eligibility.
   */
  async trigger(
    input: OfferTriggerInput,
    opts: { playerContext?: Record<string, unknown>; idempotencyKey?: string; as?: string } = {},
  ): Promise<OfferTriggerResult> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'offers.trigger');
    const body: Record<string, unknown> = { trigger: input };
    if (opts.playerContext !== undefined) body['playerContext'] = opts.playerContext;
    if (opts.idempotencyKey) body['idempotencyKey'] = opts.idempotencyKey;
    const env = await this.client.request<DataEnvelope<OfferTriggerResult>>(
      'POST',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/offers/triggers`,
      body,
    );
    return env.data;
  }

  /**
   * POST `…/offers/:instanceId/claim`: claim the current free tier of a
   * chain offer (`offer.current.type === 'free'`). Pass the `tier` the
   * player tapped (`offer.tier`). No store, no money. Answers the claim and
   * the offer after it (the next tier, or `completed`). When
   * `claim.studioFulfils` is true, deliver `claim.contents` yourself.
   * Deliver each claim from one path only (this response or the
   * `offer.tier_claimed` webhook), and de-duplicate on `claim.claimId`.
   * Idempotent (the SDK generates the key when you don't pass one). A
   * refusal throws `KratyError` with `code: 'conflict'` and
   * `details.reason` (`tier_changed`, `tier_not_free`, `offer_closed`) plus
   * `details.offer`, the offer now.
   */
  async claim(
    instanceId: string,
    opts: { tier: number; idempotencyKey?: string; as?: string },
  ): Promise<OfferClaimResult> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'offers.claim');
    const body: Record<string, unknown> = { tier: opts.tier };
    if (opts.idempotencyKey) body['idempotencyKey'] = opts.idempotencyKey;
    const env = await this.client.request<DataEnvelope<OfferClaimResult>>(
      'POST',
      this.instancePath(externalPlayerId, instanceId, '/claim'),
      body,
    );
    return env.data;
  }

  private instancePath(externalPlayerId: string, instanceId: string, rest: string): string {
    return `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/offers/${encodeURIComponent(instanceId)}${rest}`;
  }
}

/**
 * The `transactionId` to report for a store transaction (docs/22, docs/26
 * § 5.0). Client and server must report the SAME id for one transaction,
 * or the purchase is recorded twice:
 *
 *  - App Store: StoreKit 2 `transactionId`, never `originalTransactionId`;
 *  - Google Play: `orderId` (`GPA.…`), falling back to `purchaseToken`
 *    only for test purchases that have no `orderId`;
 *  - other stores: their transaction id, unchanged.
 *
 * Throws when the store's id is missing.
 */
export function canonicalTransactionId(ids: StoreTransactionIds): string {
  const pick = (v: string | undefined): string | undefined => (v && v.length > 0 ? v : undefined);
  const id =
    ids.store === 'google_play'
      ? (pick(ids.orderId) ?? pick(ids.purchaseToken))
      : pick(ids.transactionId);
  if (!id) {
    throw new Error(
      ids.store === 'google_play'
        ? 'canonicalTransactionId: google_play needs orderId (or purchaseToken for test purchases)'
        : `canonicalTransactionId: ${ids.store} needs transactionId`,
    );
  }
  return id;
}

/**
 * Guilds (docs/25): persistent player groups, one per player, up to 50
 * members, with leader / co-leader / member roles. Every method acts as the
 * active player (or `{ as }`); the game and environment come from the key.
 *
 * Start screens from `config()`: it carries the unlock gate (and whether the
 * player passes it), the create cost, what each role may do and the help
 * and score settings, so nothing is hardcoded in the client.
 */
export class GuildsClient {
  constructor(private readonly client: KratyClient) {}

  private async base(as: string | undefined, op: string): Promise<string> {
    const externalPlayerId = await resolvePlayerId(this.client, as, op);
    return `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}`;
  }

  /** GET `/guilds/config`: the game's guild rules for this player. */
  async config(opts: { as?: string } = {}): Promise<GuildClientConfig> {
    const base = await this.base(opts.as, 'guilds.config');
    return (await this.client.request<DataEnvelope<GuildClientConfig>>('GET', `${base}/guilds/config`)).data;
  }

  /** GET `/guild`: the player's guild, role, permissions and week; null when guildless. */
  async mine(opts: { as?: string } = {}): Promise<MyGuild | null> {
    const base = await this.base(opts.as, 'guilds.mine');
    return (await this.client.request<DataEnvelope<MyGuild | null>>('GET', `${base}/guild`)).data ?? null;
  }

  /** GET `/guilds/:guildId`: any guild of this game with its roster. */
  async get(guildId: string, opts: { as?: string } = {}): Promise<GuildDetail> {
    const base = await this.base(opts.as, 'guilds.get');
    return (
      await this.client.request<DataEnvelope<GuildDetail>>('GET', `${base}/guilds/${encodeURIComponent(guildId)}`)
    ).data;
  }

  /** GET `/guilds?q=`: name search, prefix matches first (the first page; see `searchPage`). */
  async search(
    query: string,
    opts: { country?: string; limit?: number; offset?: number; as?: string } = {},
  ): Promise<GuildSummary[]> {
    return (await this.searchPage(query, opts)).guilds;
  }

  /**
   * GET `/guilds?q=&offset=`: one page of name search (`limit` default 20,
   * max 50) and the `nextOffset` to ask for the next one (null at the end).
   */
  async searchPage(
    query: string,
    opts: { country?: string; limit?: number; offset?: number; as?: string } = {},
  ): Promise<GuildSearchPage> {
    const base = await this.base(opts.as, 'guilds.search');
    const params = new URLSearchParams({ q: query });
    if (opts.country) params.set('country', opts.country);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.offset) params.set('offset', String(opts.offset));
    const data = (
      await this.client.request<DataEnvelope<{ guilds: GuildSummary[]; nextOffset?: number | null }>>(
        'GET',
        `${base}/guilds?${params.toString()}`,
      )
    ).data;
    return { guilds: data.guilds, nextOffset: data.nextOffset ?? null };
  }

  /** GET `/guilds/recommended`: guilds with room, friends' guilds first; varies between calls. */
  async recommended(
    opts: { country?: string; limit?: number; as?: string } = {},
  ): Promise<RecommendedGuild[]> {
    const base = await this.base(opts.as, 'guilds.recommended');
    const params = new URLSearchParams();
    if (opts.country) params.set('country', opts.country);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return (
      await this.client.request<DataEnvelope<{ guilds: RecommendedGuild[] }>>(
        'GET',
        `${base}/guilds/recommended${qs ? `?${qs}` : ''}`,
      )
    ).data.guilds;
  }

  /** POST `/guilds`: found a guild (gate checked, cost charged atomically); you lead it. */
  async create(input: CreateGuildInput, opts: { as?: string } = {}): Promise<MyGuild> {
    const base = await this.base(opts.as, 'guilds.create');
    return (await this.client.request<DataEnvelope<MyGuild>>('POST', `${base}/guilds`, input)).data;
  }

  /** POST `/guilds/:guildId/join`: join an open guild, or ask to join a request guild. */
  async join(guildId: string, opts: { message?: string; as?: string } = {}): Promise<GuildJoinResult> {
    const base = await this.base(opts.as, 'guilds.join');
    const body: { message?: string } = {};
    if (opts.message !== undefined) body.message = opts.message;
    return (
      await this.client.request<DataEnvelope<GuildJoinResult>>(
        'POST',
        `${base}/guilds/${encodeURIComponent(guildId)}/join`,
        body,
      )
    ).data;
  }

  /** GET `/guild-requests`: your pending join requests. */
  async myRequests(opts: { as?: string } = {}): Promise<GuildJoinRequest[]> {
    const base = await this.base(opts.as, 'guilds.myRequests');
    return (await this.client.request<DataEnvelope<{ requests: GuildJoinRequest[] }>>('GET', `${base}/guild-requests`))
      .data.requests;
  }

  /** DELETE `/guild-requests/:requestId`: withdraw one of your join requests. */
  async cancelRequest(requestId: string, opts: { as?: string } = {}): Promise<void> {
    const base = await this.base(opts.as, 'guilds.cancelRequest');
    await this.client.request<unknown>('DELETE', `${base}/guild-requests/${encodeURIComponent(requestId)}`);
  }

  /** PATCH `/guild`: edit the profile (needs `edit_profile`). */
  async updateProfile(patch: GuildProfilePatch, opts: { as?: string } = {}): Promise<GuildDetail> {
    const base = await this.base(opts.as, 'guilds.updateProfile');
    return (await this.client.request<DataEnvelope<GuildDetail>>('PATCH', `${base}/guild`, patch)).data;
  }

  /** POST `/guild/leave`: a leaving leader hands over; the last one out disbands. */
  async leave(opts: { as?: string } = {}): Promise<GuildLeaveResult> {
    const base = await this.base(opts.as, 'guilds.leave');
    return (await this.client.request<DataEnvelope<GuildLeaveResult>>('POST', `${base}/guild/leave`)).data;
  }

  /** GET `/guild/requests`: your guild's pending join requests (needs `accept_requests`). */
  async requests(opts: { as?: string } = {}): Promise<GuildJoinRequest[]> {
    const base = await this.base(opts.as, 'guilds.requests');
    return (await this.client.request<DataEnvelope<{ requests: GuildJoinRequest[] }>>('GET', `${base}/guild/requests`))
      .data.requests;
  }

  /** POST `/guild/requests/:requestId/accept`: the player joins (checks re-run now). */
  async acceptRequest(requestId: string, opts: { as?: string } = {}): Promise<GuildDetail> {
    const base = await this.base(opts.as, 'guilds.acceptRequest');
    return (
      await this.client.request<DataEnvelope<GuildDetail>>(
        'POST',
        `${base}/guild/requests/${encodeURIComponent(requestId)}/accept`,
      )
    ).data;
  }

  /** POST `/guild/requests/:requestId/decline`. */
  async declineRequest(requestId: string, opts: { as?: string } = {}): Promise<void> {
    const base = await this.base(opts.as, 'guilds.declineRequest');
    await this.client.request<unknown>('POST', `${base}/guild/requests/${encodeURIComponent(requestId)}/decline`);
  }

  /** POST `/guild/members/:id/kick`: they can't rejoin this guild for the configured block. */
  async kick(memberExternalId: string, opts: { as?: string } = {}): Promise<GuildDetail> {
    return this.memberAction('kick', memberExternalId, opts.as);
  }

  /** POST `/guild/members/:id/promote`: member → co-leader. */
  async promote(memberExternalId: string, opts: { as?: string } = {}): Promise<GuildDetail> {
    return this.memberAction('promote', memberExternalId, opts.as);
  }

  /** POST `/guild/members/:id/demote`: co-leader → member. */
  async demote(memberExternalId: string, opts: { as?: string } = {}): Promise<GuildDetail> {
    return this.memberAction('demote', memberExternalId, opts.as);
  }

  private async memberAction(
    verb: 'kick' | 'promote' | 'demote',
    memberExternalId: string,
    as: string | undefined,
  ): Promise<GuildDetail> {
    const base = await this.base(as, `guilds.${verb}`);
    return (
      await this.client.request<DataEnvelope<GuildDetail>>(
        'POST',
        `${base}/guild/members/${encodeURIComponent(memberExternalId)}/${verb}`,
      )
    ).data;
  }

  /** POST `/guild/leader`: hand leadership to a member (leader only; you become co-leader). */
  async transferLeadership(memberExternalId: string, opts: { as?: string } = {}): Promise<GuildDetail> {
    const base = await this.base(opts.as, 'guilds.transferLeadership');
    return (
      await this.client.request<DataEnvelope<GuildDetail>>('POST', `${base}/guild/leader`, {
        externalPlayerId: memberExternalId,
      })
    ).data;
  }

  /** GET `/guild/help`: open help requests, yours, and your weekly helps counter. */
  async help(opts: { as?: string } = {}): Promise<GuildHelpOverview> {
    const base = await this.base(opts.as, 'guilds.help');
    return (await this.client.request<DataEnvelope<GuildHelpOverview>>('GET', `${base}/guild/help`)).data;
  }

  /** POST `/guild/help`: ask guildmates for a resource on the game's help list. */
  async requestHelp(
    input: { type: 'item' | 'currency'; resourceKey: string; amount: number },
    opts: { as?: string } = {},
  ): Promise<GuildHelpRequest> {
    const base = await this.base(opts.as, 'guilds.requestHelp');
    return (await this.client.request<DataEnvelope<GuildHelpRequest>>('POST', `${base}/guild/help`, input)).data;
  }

  /** POST `/guild/help/:requestId/donate`: delivered to them as a grant; may reward you. */
  async donate(requestId: string, opts: { amount?: number; as?: string } = {}): Promise<GuildHelpDonation> {
    const base = await this.base(opts.as, 'guilds.donate');
    const body: { amount?: number } = {};
    if (opts.amount !== undefined) body.amount = opts.amount;
    return (
      await this.client.request<DataEnvelope<GuildHelpDonation>>(
        'POST',
        `${base}/guild/help/${encodeURIComponent(requestId)}/donate`,
        body,
      )
    ).data;
  }

  /** DELETE `/guild/help/:requestId`: withdraw your own help request. */
  async cancelHelp(requestId: string, opts: { as?: string } = {}): Promise<GuildHelpRequest> {
    const base = await this.base(opts.as, 'guilds.cancelHelp');
    return (
      await this.client.request<DataEnvelope<GuildHelpRequest>>(
        'DELETE',
        `${base}/guild/help/${encodeURIComponent(requestId)}`,
      )
    ).data;
  }
}

export class LobbiesClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET /sdk/v1/lobbies/:lobbyId: poll a lobby that's still filling.
   * After `events.start` returns `lobby_forming` (202 with the
   * lobby-forming code), poll via this method until
   * `status !== 'forming'`, then retry `start`.
   */
  async read(lobbyId: string): Promise<Lobby> {
    const env = await this.client.request<{ data: Lobby }>(
      'GET',
      `/sdk/v1/lobbies/${encodeURIComponent(lobbyId)}`,
    );
    return env.data;
  }
}

export interface PollLobbyOptions {
  /** Initial poll interval (ms). Default 1_000. */
  intervalMs?: number;
  /** Cap on total wait time before rejecting. Default 60_000. */
  timeoutMs?: number;
  /** Aborts the poll early. */
  signal?: AbortSignal;
}

/**
 * Polls a lobby until it transitions out of `'forming'`. Resolves
 * with the lobby once it's `active` (or any non-forming status),
 * throws if the timeout elapses or the signal aborts.
 */
export async function pollLobbyUntilActive(
  lobbies: LobbiesClient,
  lobbyId: string,
  opts: PollLobbyOptions = {},
): Promise<Lobby> {
  const interval = opts.intervalMs ?? 1_000;
  const timeout = opts.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new Error('pollLobbyUntilActive: aborted');
    const lobby = await lobbies.read(lobbyId);
    if (lobby.status !== 'forming') return lobby;
    await sleepAbortable(interval, opts.signal);
  }
  throw new Error(`pollLobbyUntilActive: lobby '${lobbyId}' did not leave 'forming' within ${timeout}ms`);
}

export interface PollPendingGrantsOptions {
  /** Starting interval in milliseconds. Default 2_000. */
  startMs?: number;
  /** Multiplier between polls when the result is empty. Default 1.5. */
  growMs?: number;
  /** Cap. Default 30_000 (30s). */
  maxMs?: number;
  /** Abort the polling loop. */
  signal?: AbortSignal;
  /** Fires for every batch (including empty ones). */
  onBatch?: (grants: Grant[]) => void;
  /** Override the active player (server tooling only). */
  as?: string;
}

/**
 * Adaptive polling for a player's pending grants. Grows the interval
 * when the queue is empty and shrinks back to `startMs` when grants
 * land. Resolves when the consumer aborts via `signal`.
 */
export async function pollPendingGrants(
  grants: GrantsClient,
  opts: PollPendingGrantsOptions = {},
): Promise<void> {
  const start = opts.startMs ?? 2_000;
  const grow = opts.growMs ?? 1.5;
  const max = opts.maxMs ?? 30_000;
  let interval = start;
  const signal = opts.signal;
  const listOpts = opts.as ? { as: opts.as } : {};
  while (!signal?.aborted) {
    const batch = await grants.listPending(listOpts);
    opts.onBatch?.(batch);
    if (batch.length > 0) {
      interval = start;
    } else {
      interval = Math.min(interval * grow, max);
    }
    await sleepAbortable(interval, signal);
  }
}

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

// Re-export for index aggregation.
export type { KratyApiError };

// ── Chat (docs: chat.mdx) ──────────────────────────────────────────────

/** Options shared by sends: reply threading and a retry-safe client id. */
export interface ChatSendOptions {
  replyToId?: string;
  /** Retry-safe: the same id returns the same message. Generated when omitted. */
  clientMessageId?: string;
  as?: string;
}

/**
 * `kraty.chat`: direct messages, groups, guild chat and the game's public
 * channels (a paid add-on the studio enables per game; every call answers
 * `403 chat_disabled` when it's off). Conversations of every kind share one
 * shape and one set of message calls; `live()` streams them all.
 *
 * The profanity filter is resolved by the server per player: pass
 * `chat: { profanityFilter }` to the `Kraty` options (or call
 * `kraty.client.setChatFilter`) to choose for this player.
 */
export class ChatClient {
  constructor(private readonly client: KratyClient) {}

  private async base(as: string | undefined, op: string): Promise<string> {
    const externalPlayerId = await resolvePlayerId(this.client, as, op);
    return `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/chat`;
  }

  private conv(id: string): string {
    return `/conversations/${encodeURIComponent(id)}`;
  }

  private async get<T>(as: string | undefined, op: string, path: string): Promise<T> {
    const base = await this.base(as, op);
    return (await this.client.request<DataEnvelope<T>>('GET', `${base}${path}`)).data;
  }

  private async send_<T>(as: string | undefined, op: string, method: string, path: string, body?: unknown): Promise<T> {
    const base = await this.base(as, op);
    return (await this.client.request<DataEnvelope<T>>(method, `${base}${path}`, body)).data;
  }

  /** GET `/chat/config`: kinds, channels, limits, custom card types, preferences and standing. */
  async config(opts: { as?: string } = {}): Promise<ChatClientConfig> {
    return this.get(opts.as, 'chat.config', '/config');
  }

  /** GET `/chat/preferences`. */
  async preferences(opts: { as?: string } = {}): Promise<ChatPreferences> {
    return this.get(opts.as, 'chat.preferences', '/preferences');
  }

  /** PUT `/chat/preferences`: the saved filter choice (null = defaults) and who may DM the player. */
  async setPreferences(
    patch: { profanityFilter?: boolean | null; allowDirectFrom?: ChatPreferences['allowDirectFrom'] },
    opts: { as?: string } = {},
  ): Promise<ChatPreferences> {
    return this.send_(opts.as, 'chat.setPreferences', 'PUT', '/preferences', patch);
  }

  /** GET `/chat/conversations`: the inbox, most recent first, with unread counts. */
  async conversations(
    opts: { kind?: string; limit?: number; offset?: number; as?: string } = {},
  ): Promise<ChatConversationPage> {
    const params = new URLSearchParams();
    if (opts.kind) params.set('kind', opts.kind);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.offset) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return this.get(opts.as, 'chat.conversations', `/conversations${qs ? `?${qs}` : ''}`);
  }

  /** GET `/chat/unread`: unread totals for a badge (muted conversations don't count). */
  async unread(opts: { as?: string } = {}): Promise<ChatUnread> {
    return this.get(opts.as, 'chat.unread', '/unread');
  }

  /** GET `/chat/conversations/:id`: one conversation (with members for direct and group). */
  async conversation(conversationId: string, opts: { as?: string } = {}): Promise<ChatConversationDetail> {
    return this.get(opts.as, 'chat.conversation', this.conv(conversationId));
  }

  /** POST `/chat/direct`: open (or find) the direct conversation with another player. */
  async openDirect(
    target: { externalPlayerId: string } | { friendCode: string },
    opts: { as?: string } = {},
  ): Promise<ChatConversation> {
    return this.send_(opts.as, 'chat.openDirect', 'POST', '/direct', target);
  }

  /** POST `/chat/groups`: create a group; the caller is its owner. */
  async createGroup(
    input: { title: string; externalPlayerIds?: string[]; metadata?: Record<string, unknown> },
    opts: { as?: string } = {},
  ): Promise<ChatConversationDetail> {
    return this.send_(opts.as, 'chat.createGroup', 'POST', '/groups', input);
  }

  /** PATCH `/chat/conversations/:id`: rename / edit a group (owner, admins). */
  async updateGroup(
    conversationId: string,
    patch: { title?: string; metadata?: Record<string, unknown> },
    opts: { as?: string } = {},
  ): Promise<ChatConversationDetail> {
    return this.send_(opts.as, 'chat.updateGroup', 'PATCH', this.conv(conversationId), patch);
  }

  /** POST `/chat/conversations/:id/members`: add players to a group (owner, admins). */
  async addMembers(
    conversationId: string,
    externalPlayerIds: string[],
    opts: { as?: string } = {},
  ): Promise<ChatConversationDetail> {
    return this.send_(opts.as, 'chat.addMembers', 'POST', `${this.conv(conversationId)}/members`, { externalPlayerIds });
  }

  /** DELETE `/chat/conversations/:id/members/:externalPlayerId`: remove a lower-ranked member (or yourself). */
  async removeMember(
    conversationId: string,
    externalPlayerId: string,
    opts: { as?: string } = {},
  ): Promise<{ conversationId: string; removed: string }> {
    return this.send_(
      opts.as,
      'chat.removeMember',
      'DELETE',
      `${this.conv(conversationId)}/members/${encodeURIComponent(externalPlayerId)}`,
    );
  }

  /** PUT `/chat/conversations/:id/members/:externalPlayerId/role` (owner only; `owner` hands the group over). */
  async setRole(
    conversationId: string,
    externalPlayerId: string,
    role: 'owner' | 'admin' | 'member',
    opts: { as?: string } = {},
  ): Promise<ChatConversationDetail> {
    return this.send_(
      opts.as,
      'chat.setRole',
      'PUT',
      `${this.conv(conversationId)}/members/${encodeURIComponent(externalPlayerId)}/role`,
      { role },
    );
  }

  /** POST `/chat/conversations/:id/leave`: leave a group, or hide a direct conversation. */
  async leave(conversationId: string, opts: { as?: string } = {}): Promise<{ conversationId: string; left: true }> {
    return this.send_(opts.as, 'chat.leave', 'POST', `${this.conv(conversationId)}/leave`);
  }

  /** GET `/chat/guild`: the player's guild conversation. */
  async guild(opts: { as?: string } = {}): Promise<ChatConversation> {
    return this.get(opts.as, 'chat.guild', '/guild');
  }

  /** GET `/chat/channels`: every public channel. */
  async channels(opts: { as?: string } = {}): Promise<ChatConversation[]> {
    return (await this.get<{ channels: ChatConversation[] }>(opts.as, 'chat.channels', '/channels')).channels;
  }

  /** GET `/chat/channels/:key`: one public channel. */
  async channel(key: string, opts: { as?: string } = {}): Promise<ChatConversation> {
    return this.get(opts.as, 'chat.channel', `/channels/${encodeURIComponent(key)}`);
  }

  /**
   * GET `/chat/conversations/:id/messages`: a page, oldest to newest.
   * `before` pages back through history; `after` catches up from a known seq.
   */
  async messages(
    conversationId: string,
    opts: { before?: number; after?: number; limit?: number; as?: string } = {},
  ): Promise<ChatMessagePage> {
    const params = new URLSearchParams();
    if (opts.before !== undefined) params.set('before', String(opts.before));
    if (opts.after !== undefined) params.set('after', String(opts.after));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return this.get(opts.as, 'chat.messages', `${this.conv(conversationId)}/messages${qs ? `?${qs}` : ''}`);
  }

  /** POST `/chat/conversations/:id/messages`: send text. */
  async send(conversationId: string, text: string, opts: ChatSendOptions = {}): Promise<ChatMessage> {
    return this.send_(opts.as, 'chat.send', 'POST', `${this.conv(conversationId)}/messages`, {
      type: 'text',
      text,
      ...(opts.replyToId ? { replyToId: opts.replyToId } : {}),
      clientMessageId: opts.clientMessageId ?? defaultIdempotencyKey(),
    });
  }

  /** POST `/chat/conversations/:id/messages`: send a game-defined card (`customType` from the config). */
  async sendCustom(
    conversationId: string,
    customType: string,
    payload: unknown,
    opts: ChatSendOptions & { text?: string } = {},
  ): Promise<ChatMessage> {
    return this.send_(opts.as, 'chat.sendCustom', 'POST', `${this.conv(conversationId)}/messages`, {
      type: 'custom',
      customType,
      payload,
      ...(opts.text !== undefined ? { text: opts.text } : {}),
      ...(opts.replyToId ? { replyToId: opts.replyToId } : {}),
      clientMessageId: opts.clientMessageId ?? defaultIdempotencyKey(),
    });
  }

  /**
   * PATCH `/chat/conversations/:id/messages/:messageId`: edit your own
   * message within the game's edit window (`config().messages.editWindowSeconds`).
   */
  async editMessage(conversationId: string, messageId: string, text: string, opts: { as?: string } = {}): Promise<ChatMessage> {
    return this.send_(
      opts.as,
      'chat.editMessage',
      'PATCH',
      `${this.conv(conversationId)}/messages/${encodeURIComponent(messageId)}`,
      { text },
    );
  }

  /** DELETE `/chat/conversations/:id/messages/:messageId`: your own, or any as a group admin / guild officer. */
  async deleteMessage(
    conversationId: string,
    messageId: string,
    opts: { as?: string } = {},
  ): Promise<{ messageId: string; deleted: boolean }> {
    return this.send_(
      opts.as,
      'chat.deleteMessage',
      'DELETE',
      `${this.conv(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    );
  }

  /** POST `/chat/conversations/:id/read`: mark read up to `seq` (never backwards). */
  async markRead(conversationId: string, seq: number, opts: { as?: string } = {}): Promise<{ lastReadSeq: number }> {
    return this.send_(opts.as, 'chat.markRead', 'POST', `${this.conv(conversationId)}/read`, { seq });
  }

  /** POST `/chat/conversations/:id/typing`: "is typing…" (throttled server-side, never stored). */
  async typing(conversationId: string, opts: { as?: string } = {}): Promise<void> {
    await this.send_(opts.as, 'chat.typing', 'POST', `${this.conv(conversationId)}/typing`, {});
  }

  /** PUT `/chat/conversations/:id/settings`: mute notifications until a time, or hide a direct conversation. */
  async setConversationSettings(
    conversationId: string,
    patch: { mutedUntil?: string | null; hidden?: boolean },
    opts: { as?: string } = {},
  ): Promise<ChatConversation> {
    return this.send_(opts.as, 'chat.setConversationSettings', 'PUT', `${this.conv(conversationId)}/settings`, patch);
  }

  /**
   * GET `/chat/stream`: every inbox conversation live, plus the named public
   * channels (at most 10). Does NOT auto-reconnect: re-open after a backoff
   * and catch up with `messages(id, { after })`.
   */
  async live(opts: { channels?: string[]; as?: string } = {}): Promise<ChatStream> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'chat.live');
    return openChatStream({
      fetchImpl: this.client.fetchForStreaming,
      baseUrl: this.client.baseUrl,
      externalPlayerId,
      authHeader: this.client.authHeader,
      playerSecret: this.client.playerSecret,
      sdkUserAgent: this.client.sdkUserAgent,
      channels: opts.channels ?? [],
      filter: this.client.chatFilter,
    });
  }

  /** Callback form of {@link ChatClient.live}. Returns a stop function. */
  async watch(
    handler: (event: ChatStreamEvent) => void,
    opts: { channels?: string[]; onError?: (err: unknown) => void; as?: string } = {},
  ): Promise<() => Promise<void>> {
    const stream = await this.live({
      ...(opts.channels ? { channels: opts.channels } : {}),
      ...(opts.as ? { as: opts.as } : {}),
    });
    void (async () => {
      try {
        for await (const ev of stream.events) handler(ev);
      } catch (err) {
        opts.onError?.(err);
      }
    })();
    return () => stream.close();
  }
}

/**
 * `kraty.moderation`: reporting players and the player's own standing.
 * Works in every game, with or without chat: the in-app "report player"
 * the app stores require for user-generated content. Blocking lives on
 * `kraty.friends.block`.
 */
export class ModerationClient {
  constructor(private readonly client: KratyClient) {}

  private async base(as: string | undefined, op: string): Promise<string> {
    const externalPlayerId = await resolvePlayerId(this.client, as, op);
    return `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}`;
  }

  /** POST `/reports`: report another player (optionally with the messages in question). */
  async report(input: ReportInput, opts: { as?: string } = {}): Promise<MyReport> {
    const base = await this.base(opts.as, 'moderation.report');
    return (await this.client.request<DataEnvelope<MyReport>>('POST', `${base}/reports`, input)).data;
  }

  /** GET `/reports`: the reports this player filed and their status. */
  async reports(opts: { limit?: number; as?: string } = {}): Promise<MyReport[]> {
    const base = await this.base(opts.as, 'moderation.reports');
    const qs = opts.limit !== undefined ? `?limit=${opts.limit}` : '';
    return (await this.client.request<DataEnvelope<{ reports: MyReport[] }>>('GET', `${base}/reports${qs}`)).data.reports;
  }

  /** GET `/moderation/status`: mutes, chat bans and unacknowledged warnings in force. */
  async status(opts: { as?: string } = {}): Promise<ModerationStatus> {
    const base = await this.base(opts.as, 'moderation.status');
    return (await this.client.request<DataEnvelope<ModerationStatus>>('GET', `${base}/moderation/status`)).data;
  }

  /** POST `/moderation/warnings/:id/acknowledge`: the player saw the warning. */
  async acknowledgeWarning(restrictionId: string, opts: { as?: string } = {}): Promise<Restriction> {
    const base = await this.base(opts.as, 'moderation.acknowledgeWarning');
    return (
      await this.client.request<DataEnvelope<Restriction>>(
        'POST',
        `${base}/moderation/warnings/${encodeURIComponent(restrictionId)}/acknowledge`,
      )
    ).data;
  }
}
