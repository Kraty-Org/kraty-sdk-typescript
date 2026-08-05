import { KratyClient } from './client.js';
import { KratyApiError } from './errors.js';
import { MembershipKind } from './finalization.js';
import {
  openLeaderboardStream,
  type LeaderboardStream,
  type LeaderboardStreamEvent,
} from './leaderboard-stream.js';
import type {
  BoardStandings,
  BlockedPlayer,
  Catalog,
  ConsumeItemInput,
  ConsumeItemResult,
  DebitWalletInput,
  DebitWalletResult,
  EventLeaderboard,
  EventLeaderboardReadOptions,
  EventListing,
  Friend,
  FriendCode,
  FriendRequests,
  FriendSearchResult,
  FriendTarget,
  Grant,
  GrantSelfInput,
  Leaderboard,
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
      try {
        streamHandle = await this.live(leaderboardId);
      } catch (err) {
        try { onError(err); } catch { /* swallow */ }
        return;
      }
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
export class FriendsClient {
  constructor(private readonly client: KratyClient) {}

  /**
   * GET `/friend-code`: the caller's short, shareable friend code
   * (6 chars, unambiguous alphabet), generated on first use and stable
   * forever after. Share it out-of-band so a friend can `add` you
   * without a username search.
   */
  async getCode(opts: { as?: string } = {}): Promise<FriendCode> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.getCode');
    const env = await this.client.request<DataEnvelope<FriendCode>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friend-code`,
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
  async list(opts: { as?: string } = {}): Promise<Friend[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.list');
    const env = await this.client.request<DataEnvelope<{ friends: Friend[] }>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends`,
    );
    return env.data.friends;
  }

  /**
   * GET `/friends/search?q=`: find other players by display name within
   * the same game + environment. Each hit reports the caller's
   * relationship to that player; blocked players are omitted.
   */
  async search(query: string, opts: { limit?: number; as?: string } = {}): Promise<FriendSearchResult[]> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.search');
    const params = new URLSearchParams({ q: query });
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const env = await this.client.request<DataEnvelope<{ results: FriendSearchResult[] }>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/search?${params.toString()}`,
    );
    return env.data.results;
  }

  /**
   * GET `/friends/requests`: the caller's pending incoming + outgoing
   * friend requests.
   */
  async listRequests(opts: { as?: string } = {}): Promise<FriendRequests> {
    const externalPlayerId = await resolvePlayerId(this.client, opts.as, 'friends.listRequests');
    const env = await this.client.request<DataEnvelope<FriendRequests>>(
      'GET',
      `/sdk/v1/players/${encodeURIComponent(externalPlayerId)}/friends/requests`,
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
