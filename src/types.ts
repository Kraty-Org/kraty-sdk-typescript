/**
 * Public response types for the `/sdk/v1` surface, mirroring the
 * OpenAPI spec at `apps/backend/openapi.json`. Kept hand-authored
 * (rather than generated) so the SDK stays terse and contributors can
 * read this file standalone; drift is caught by integration tests.
 */

export type AttemptStatus = 'in_progress' | 'completed' | 'expired' | 'force_completed';

export interface Attempt {
  id: string;
  eventId: string;
  eventWindowId: string;
  leaderboardId: string;
  playerId: string;
  startedAt: string;
  endsAt: string;
  completedAt: string | null;
  metrics: Record<string, number>;
  metricsRaw: Record<string, number>;
  score: number;
  status: AttemptStatus;
}

export interface StartAttemptResponse {
  attempt: Attempt;
  leaderboardId: string;
  windowEndsAt: string;
  /** Team events only: the player's team seats in this window. */
  teams?: TeamSeatView[];
}

export interface ProgressInput {
  /** `'set'` writes the value as the new metric; `'increment'` adds to the current. */
  mode: 'set' | 'increment';
  metricValue?: number;
  metrics?: Record<string, number>;
  /** Override server-side timestamp for replay scenarios. */
  occurredAt?: string;
  /** SDK auto-generates one if omitted. */
  idempotencyKey?: string;
  /**
   * Team events: which of the player's teams this progress counts for.
   * Needed only when the player holds several team seats and the event
   * routes contributions to a chosen team (partner bars).
   */
  eventTeamId?: string;
}

export interface LeaderboardEntry {
  participantId: string;
  kind: 'player' | 'bot';
  name: string | null;
  avatar?: string | null;
  /**
   * ISO-3166 alpha-2 country of the player (server-resolved, e.g. `'PT'`),
   * for rendering a flag next to the entry. `null` for bots and when the
   * server couldn't resolve it.
   */
  country?: string | null;
  /**
   * Immutable anonymized identity fields for players. `name` / `avatar`
   * above hold the player's real display identity (from `setIdentity`)
   * with a fallback to the synthetic-pool value; these two carry the
   * pool value directly, so a game can render a privacy-preserving view
   * (public boards, cross-game aggregations) without a second lookup.
   * `null` on bot entries and on rows that predate the split feature.
   */
  anonymizedName?: string | null;
  anonymizedAvatar?: string | null;
  score: number;
  rank: number;
  /**
   * `true` when this entry is the player calling the API (resolved from
   * the `externalId` passed via `includeSelf`). Render "You" badges or
   * highlight rows off this rather than matching `participantId` to the
   * external id yourself, since that comparison fails because the server
   * surfaces the internal player UUID, not the external one. Always
   * `false` on entries without a self-context request, and on bot
   * entries regardless.
   */
  isSelf: boolean;
  /**
   * Per-player progression balances requested via `progression: ['level']`
   * on the read, e.g. `{ level: 12 }`. Absent when none were requested; a
   * resource the player never earned reads `0`. Never present on bot rows.
   */
  progression?: Record<string, number>;
  /**
   * Team boards only (`participantScope: 'team'`): the event team this row
   * stands for; `null` on rival bot teams. Team rows keep `kind: 'player'`,
   * so a UI that ignores this field still renders them as ordinary rows.
   */
  team?: LeaderboardEntryTeam | null;
}

/** The team behind a row of a team board. */
export interface LeaderboardEntryTeam {
  eventTeamId: string;
  badge: string | null;
  memberCount: number;
}

/**
 * Public identity envelope surfaced on player responses: the same shape
 * for both `getIdentity()` (real display value) and `getAnonymizedIdentity()`
 * (immutable synthetic pool value). `country` is the same on either view
 * — a player has one real country regardless of which name/avatar the
 * caller chose to render.
 */
export interface PlayerIdentity {
  name: string;
  avatar?: string | null;
  country?: string | null;
}

/**
 * Promotion / relegation limits for a board division, surfaced on board
 * reads so a game can render "top N promote / bottom N relegate" straight
 * from server config — change the ladder in the dashboard and every client
 * reflects it without a new build. Each side is `null` when the board runs
 * no ladder on that end; `places` is the furthest position that still moves,
 * `itemKey` the progression item that gets nudged.
 */
export interface ProgressionLimits {
  /** The top `places` positions promote (climb `itemKey`); null if none. */
  promotion: { places: number; itemKey: string } | null;
  /** The bottom `places` positions relegate (drop `itemKey`); null if none. */
  relegation: { places: number; itemKey: string } | null;
}

/**
 * The auto-generated per-event-window leaderboard, addressed by the
 * UUID returned in `events.start(...)`'s `attempt.leaderboardId`. For
 * the dashboard-configured cross-event boards, see {@link Leaderboard}.
 */
export interface EventLeaderboard {
  leaderboardId: string;
  mode: string;
  /**
   * `'team'` on a co-op team board: entries are teams (and rival bot
   * teams) and `self` is your team. `'player'` otherwise.
   */
  participantScope?: 'player' | 'team';
  finalized: boolean;
  entries: LeaderboardEntry[];
  self: { rank: number; score: number } | null;
  /** Promotion/relegation cutoffs for this division, from server config. */
  progression?: ProgressionLimits;
  /** `true` on the response to `join(...)`; absent on plain reads. */
  joined?: boolean;
}

export interface EventLeaderboardReadOptions {
  /** Number of entries to fetch. 1–200, default 50 on the server side. */
  limit?: number;
  /**
   * Progression economy keys to attach to each player entry (max 8), e.g.
   * `['level']`. Omit and nothing extra is read server-side.
   */
  progression?: string[];
  /** When true, server returns `self: { rank, score }` for the given externalId. */
  includeSelf?: boolean;
  /** Required when `includeSelf` is set. */
  externalId?: string;
}

/**
 * The dashboard-configured cross-event leaderboard, addressed by its
 * game-scoped `key` (e.g. `"weekly_global"`). The primary surface for
 * most game UI. For the auto-created per-event-window boards, see
 * {@link EventLeaderboard}.
 */
export interface Leaderboard {
  /** The board's stable game-scoped key (e.g. `"weekly_global"`). */
  key: string;
  /** UUID of the leaderboard config row. */
  leaderboardId: string;
  scope: 'game' | 'studio';
  resetCadence: 'never' | 'weekly' | 'monthly';
  scoreAggregation: 'best' | 'latest' | 'sum';
  /** Empty string for unsegmented boards; bucket value otherwise. */
  segment: string | null;
  /** ISO timestamp of the period this read refers to. */
  period: string;
  /** Promotion/relegation cutoffs for this division, from server config. */
  progression?: ProgressionLimits;
  entries: LeaderboardEntry[];
  self: { rank: number; score: number } | null;
  /** `true` on the response to `join(...)`; absent on plain reads. */
  joined?: boolean;
}

/** Which segment(s) a {@link LeaderboardsClient.standings} call returns. */
export type StandingsScope = 'self_segment' | 'mine' | 'segment' | 'all';

/** One segment block in a {@link BoardStandings} response. */
export interface StandingsSegment {
  /** Bucket value; `null` on unsegmented boards. */
  segment: string | null;
  /** `true` when the caller appears in this segment for the period. */
  participated: boolean;
  /** The caller's rank within this segment, or `null` if not present. */
  selfRank: number | null;
  entries: LeaderboardEntry[];
}

/**
 * Flexible multi-segment standings: the versatile counterpart to
 * {@link Leaderboard}. Returns one {@link StandingsSegment} block per
 * segment selected by `scope`, live or for a past `period`.
 */
export interface BoardStandings {
  key: string;
  leaderboardId: string;
  scope: 'game' | 'studio';
  resetCadence: 'never' | 'weekly' | 'monthly';
  scoreAggregation: 'best' | 'latest' | 'sum';
  period: string;
  segments: StandingsSegment[];
  /** `true` when more segments existed than `maxSegments` returned. */
  segmentsTruncated: boolean;
}

export interface StandingsReadOptions {
  /** Progression economy keys to attach to each player entry (max 8). */
  progression?: string[];
  /**
   * Which segments to return (default `'all'`):
   *   - `'self_segment'`: the caller's single home segment.
   *   - `'mine'`        : every segment the caller appears in.
   *   - `'segment'`     : the one named in `segment`.
   *   - `'all'`         : every segment for the period.
   * `self_segment`/`mine` resolve the caller from `externalId` (or the
   * SDK's active identity).
   */
  scope?: StandingsScope;
  /** Required when `scope: 'segment'` on a segmented board. */
  segment?: string;
  /** `'current'` (default) or an ISO period timestamp from `listPeriods`. */
  period?: 'current' | string;
  /** Flags `isSelf`/`selfRank`; auto-resolved for `self_segment`/`mine`. */
  externalId?: string;
  /** Per-segment top-N (1..200, default 50). */
  limit?: number;
  /** Cap on returned segment blocks (1..100, default 20). */
  maxSegments?: number;
}

/**
 * Result of `LeaderboardsClient.submitScore`: the player's new
 * standing on the board after the write. `rank` is `null` when the
 * board can't resolve a position for the caller yet (e.g. the period
 * just rolled over, or the score didn't beat a `best`-aggregation
 * board's existing entry).
 */
export interface LeaderboardScoreResult {
  /** UUID of the leaderboard config row the score landed on. */
  leaderboardId: string;
  /** The score now recorded for the player on this board. */
  score: number;
  /** The player's rank after the write, or `null` if not yet ranked. */
  rank: number | null;
}

/** One entry of {@link LeaderboardsClient.list}: a board the game can show. */
export interface LeaderboardSummary {
  key: string;
  /** LocalizedString: a plain string or a locale map. */
  name: unknown;
  description: string | null;
  resetCadence: 'never' | 'weekly' | 'monthly' | string;
  /** ISO time the current period ends; null when the board never resets. */
  nextResetAt: string | null;
  /** False when only the studio's server may submit scores to this board. */
  acceptClientScores: boolean;
  /** playerContext fields that segment the board; pass one as `segment`. */
  contextSegments: string[];
}

export interface LeaderboardReadOptions {
  /** Progression economy keys to attach to each player entry (max 8). */
  progression?: string[];
  /** Top-N rows to return (1..200, default 50). */
  limit?: number;
  /**
   * Bucket value for segmented boards. Required only for `context`
   * segmentation: pass the same value the SDK sent in
   * `playerContext[segmentation.key]` on attempt start. For
   * `progression`-segmented boards omit it: the server derives the
   * caller's division. Unsegmented boards ignore it.
   */
  segment?: string;
  /**
   * `'current'` (default) reads the live ranks. An ISO timestamp from
   * `listPeriods(...)` reads the historical snapshot.
   */
  period?: 'current' | string;
  /** When set, returns the caller's rank under `self` (current only). */
  includeSelf?: boolean;
  /** Required when `includeSelf` is true. */
  externalId?: string;
}

export interface LeaderboardPeriod {
  periodStartedAt: string;
  periodEndedAt: string;
}

export interface LeaderboardPeriods {
  key: string;
  leaderboardId: string;
  currentPeriodStartedAt: string;
  periods: LeaderboardPeriod[];
}

export type GrantKind = 'reward' | 'crate';
export type GrantStatus = 'pending' | 'claimed' | 'expired';

export interface Grant {
  id: string;
  kind: GrantKind;
  contents: Record<string, unknown>;
  sourceKind: string;
  sourceRefId: string | null;
  parentGrantId: string | null;
  status: GrantStatus;
  rolledAt: string | null;
  claimedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface OpenCrateResponse {
  crate: Grant;
  contents: Grant;
}

/** One line of a client-initiated grant (see {@link GrantsClient.grant}). */
export type GrantEntryInput =
  | { type: 'currency'; currencyKey: string; amount: number }
  | { type: 'item'; itemKey: string; quantity: number; parameters?: Record<string, unknown> }
  | { type: 'crate'; crateItemKey: string; quantity: number };

/**
 * Body of a client-initiated grant. The player secret makes it self-only
 * (you can only grant to the active player), and the game's inventory
 * management must be `permissive` or the server returns 403
 * `inventory_not_permissive`.
 */
export interface GrantSelfInput {
  entries: GrantEntryInput[];
  /** Defaults to `'reward'`. Use `'crate'` for a grant opened later via {@link GrantsClient.open}. */
  kind?: GrantKind;
  /** Optional grant TTL (ISO datetime). */
  expiresAt?: string;
  metadata?: Record<string, unknown>;
  /** Optional dedupe key; a replay with the same key returns the same grant. */
  idempotencyKey?: string;
}

/**
 * Milestone payouts that fired during a single `progress` call. The
 * `key` identifies which milestone tripped (designers set this in the
 * event editor, so show a toast or run a celebration animation against
 * it). `grants` carries the concrete rewards the engine wrote, the same
 * shape `/grants/pending` would return, so the same handler can render
 * either path.
 */
export interface MilestoneFired {
  key: string;
  grants: Grant[];
}

export interface ProgressResponse {
  attempt: Attempt;
  /** Empty when nothing fired this update, never null, so callers can
   *  iterate without a null check. */
  milestonesFired: MilestoneFired[];
  /** Team events only: the player's team seats after this write. */
  teams?: TeamSeatView[];
}

/** Result of `events.finish()`: the finalized attempt + how it resolved. */
export interface FinishAttemptResponse {
  attempt: Attempt;
  /**
   * `'completed'` is a score-attack end, or a target that was already met
   * (completion rewards rolled). `'expired'` is a target event that ended before
   * its target (participation only, same as a timeout).
   */
  outcome: 'completed' | 'expired';
  /** Team events only: the player's team seats after the finish. */
  teams?: TeamSeatView[];
}

/**
 * One slot in an event's `entryCost.currencies` list, paid from the
 * player's wallet on attempt start. Lifted from the backend's
 * `EntryCost` shape verbatim.
 */
export interface EntryCostCurrency {
  key: string;
  amount: number;
}

/**
 * One slot in an event's `entryCost.items` list, consumed from
 * inventory on attempt start.
 */
export interface EntryCostItem {
  key: string;
  quantity: number;
}

/**
 * Transactional cost paid on `events.start`. Server atomically debits +
 * creates the attempt in a single tx, so partial debits never persist.
 * Missing entry triggers a `KratyApiError` with code
 * `insufficient_entry_cost`.
 */
export interface EntryCost {
  currencies?: EntryCostCurrency[];
  items?: EntryCostItem[];
}

/**
 * Reward entry: one slot inside a reward bundle or milestone reward
 * payload. Sealed union on `type`.
 */
export type RewardEntryPreview =
  | { type: 'currency'; currencyKey: string; amount: number }
  | { type: 'item'; itemKey: string; quantity: number; parameters?: Record<string, unknown> }
  | { type: 'crate'; crateItemKey: string; quantity: number };

/**
 * Inline preview of a reward bundle's contents. Surfaced on
 * `EventListing.rewardPolicy` so the studio can render "you'll win X"
 * without resolving bundle IDs against a separate endpoint.
 */
export interface RewardBundlePreview {
  key: string;
  /** LocalizedString: either a plain string or a map. */
  name: unknown;
  entries: RewardEntryPreview[];
}

/**
 * One milestone reward that fires when the player crosses `threshold`
 * on `metricKey` during a single attempt. Use the preview to render
 * "next milestone: 5 rabbits → 200 cash + 5 bullets" in your UI.
 */
export interface MilestoneRewardPreview {
  key: string;
  metricKey: string;
  threshold: number;
  entries: RewardEntryPreview[];
}

/**
 * Reward policy summary with inline bundle previews. Mirrors the four
 * sealed policy types the backend supports:
 *  - `none`: event has no rewards (training / practice modes).
 *  - `fixed_bundle`: everyone who completes gets the same bundle.
 *  - `rank_scaled`: bundle picked by the player's final leaderboard rank.
 *  - `shared_pool`: currency pool split among winners.
 */
export interface RewardPolicySummary {
  type: 'none' | 'fixed_bundle' | 'rank_scaled' | 'shared_pool' | string;
  /** Set when `type === 'fixed_bundle'`. */
  bundle?: RewardBundlePreview | null;
  /** Set when `type === 'rank_scaled'`. */
  tiers?: Array<{ fromRank: number; toRank: number; bundle: RewardBundlePreview | null }>;
  /** Set when `type === 'shared_pool'`. */
  pool?: number;
  /** Set when `type === 'shared_pool'`. */
  currencyKey?: string;
}

/**
 * How much of the player's attempt allowance on this event window is
 * spent, for an entry counter ("Play — 1/2 today").
 *
 * `used*` counts include a live attempt: an entry is spent when it
 * starts, not when it finishes. A counter is only populated when the
 * matching cap is set — an uncapped event reports `0` used and `null`
 * max. `remaining` is the tightest configured cap, `null` when the
 * event caps nothing.
 */
export interface AttemptQuota {
  /** Attempts allowed for the whole window; null = unlimited. */
  maxPerWindow: number | null;
  usedInWindow: number;
  /** Attempts allowed per local calendar day; null = unlimited. */
  maxPerDay: number | null;
  usedToday: number;
  /** What the player can still start now; null = unlimited. */
  remaining: number | null;
}

export interface EventListing {
  eventKey: string;
  /**
   * LocalizedString: either a plain string or a map. Kept as
   * `unknown` so the SDK doesn't force a shape on consumers.
   */
  name: unknown;
  windowId: string;
  startsAt: string;
  endsAt: string;
  leaderboardId: string | null;
  currentAttemptId: string | null;

  /**
   * `'single_metric'` | `'multi_metric'` (and any future event-type
   * registry entries). Lets the SDK consumer pick the right UI
   * without a hardcoded per-event catalog.
   */
  type?: string;

  /**
   * `'global'` | `'global_segmented'` | `'grouped'` | `'lobby_matched'`.
   * Combined with `leaderboardId` tells the consumer whether to
   * expect `lobby_forming` on `events.start`.
   */
  leaderboardMode?: string;

  /**
   * Free-form metric definitions from the event row (key, target,
   * cap, scoreWeight, …). Same shape the server stores.
   */
  metrics?: Array<Record<string, unknown>>;

  /** Player-condition tree; null when there's no join gate. */
  entryRequirement?: Record<string, unknown> | null;

  /** Cost paid on attempt start. Absent / empty means "free to enter". */
  entryCost?: EntryCost | null;

  /**
   * Studio-defined free-form blob. Event-level metadata merged with
   * the active window's metadata (window keys win). Use for UI hints
   * such as banner image keys, theme colors, special-event copy, etc.
   */
  metadata?: Record<string, unknown>;

  /** Mid-attempt milestone rewards. Empty array when none configured. */
  milestoneRewards?: MilestoneRewardPreview[];

  /** Reward policy summary with inline bundle previews. */
  rewardPolicy?: RewardPolicySummary;

  /**
   * Attempts spent vs. allowed for this player. Absent on backends
   * older than the attempt-quota field; a modern backend always sets
   * it (all-null maxima when the event caps nothing).
   */
  attemptQuota?: AttemptQuota;

  /**
   * Score that ends a `first_to_score` session: the race's finish line.
   * Draw progress toward it; null when the event has no such target.
   */
  goal?: number | null;

  /**
   * Condition that gates the event's visibility (`entryRequirement` gates
   * joining). The server enforces it on `events.start`; surfaced so the UI
   * can show why an event is locked. Null when there's no gate.
   */
  unlockCondition?: Record<string, unknown> | null;

  /**
   * Length of one attempt in seconds. It's also cut short by the window
   * end (`endsAt`) and, for session events, by the session ending.
   */
  attemptDurationSeconds?: number;

  /**
   * Team events only: the player's team seats in this window (score, goal,
   * milestones, your contribution and rank). Absent for non-team events.
   */
  teams?: TeamSeatView[];

  /**
   * Team events only: how teams form, i.e. what your UI does before the
   * player can score for a team. `'external'` (your server posts rosters)
   * and `'attribute'` (e.g. country) need nothing; `'auto_match'`: offer
   * "Find a team" (`events.matchTeam`, or just `start`); `'partner_slots'`:
   * partner invites / `events.randomPartner`, then pass `eventTeamId` on
   * progress. Absent for non-team events.
   */
  teamFormation?: string;

  /**
   * Team events only: the formation's player-facing options, so your UI can
   * offer the right setup before the player has a team (e.g. hide "random
   * partner" when `allowRandom` is false, stop inviting at `maxPartners`,
   * know which `playerContext` keys pick a country team).
   */
  teamOptions?: TeamClientOptions;
}

/** `EventListing.teamOptions`: what a client needs to get a player onto a team. */
export interface TeamClientOptions {
  /** Most members a team holds. */
  maxMembers: number;
  /** `auto_match`: players per matched team (2 on partner events); null otherwise. */
  teamSize: number | null;
  /** `partner_slots`: partner bars a player may hold; null otherwise. */
  maxPartners: number | null;
  /** `partner_slots`: whether `randomPartner` is offered; null otherwise. */
  allowRandom: boolean | null;
  /** `attribute`: the `playerContext` keys the team is keyed by. The server-resolved `country` is never listed. */
  contextKeys: string[];
}

/**
 * One item row as exposed to game clients via the catalog endpoint.
 * Display-relevant fields only; internal config / archival
 * timestamps stay off the SDK wire format.
 */
export interface CatalogItem {
  key: string;
  /** LocalizedString. */
  name: unknown;
  iconUrl: string | null;
  /** LocalizedString. */
  description: unknown | null;
  itemTypeKey: string;
  tags: string[];
  rarity: string | null;
  attributes: Record<string, unknown>;
}

/**
 * One currency row as exposed to game clients. `kind` distinguishes
 * spendable currencies (`'currency'`) from progression resources
 * (`'progression'`).
 */
export interface CatalogCurrency {
  key: string;
  /** LocalizedString. */
  name: unknown;
  iconUrl: string | null;
  /** LocalizedString. */
  description: unknown | null;
  kind: 'currency' | 'progression' | string;
  /**
   * A derived progression item's curve (a `level` from `xp`): each level and
   * the source balance that reaches it, lowest first. Null / absent for
   * everything else. Draw "120 / 200 XP" from it without hardcoding levels.
   */
  derived?: CatalogDerivedProgression | null;
}

export interface CatalogDerivedProgression {
  /** The item this one follows, e.g. `xp`. */
  sourceKey: string;
  levels: Array<{ level: number; sourceRequired: number }>;
}

export interface Catalog {
  items: CatalogItem[];
  currencies: CatalogCurrency[];
}

export interface PlayerContext {
  /** Arbitrary key/value pairs the engine forwards to score formulas, segments, etc. */
  [field: string]: unknown;
}

export type LobbyStatus = 'forming' | 'active' | 'closed';

export interface Lobby {
  id: string;
  eventId: string;
  eventWindowId: string;
  leaderboardId: string | null;
  mode: string;
  status: LobbyStatus | string;
  capacity: number;
  fillBy: string | null;
  participantCount: number;

  /**
   * Projected bot count at read time, derived server-side from the
   * lobby's age and the matchmaking drip interval. Grows monotonically
   * while the lobby is `'forming'`. UI typically renders
   * `participantCount + botSlots` filled cells out of `capacity` for a
   * smooth fill animation.
   */
  botSlots?: number;

  startedAt: string | null;
  endsAt: string | null;
}

/**
 * Convenience: total filled cells (humans + projected bots), capped at
 * capacity in case server / client clocks ever disagree mid-drip.
 */
export function lobbyFilledSlots(lobby: Lobby): number {
  const total = (lobby.participantCount ?? 0) + (lobby.botSlots ?? 0);
  return total > lobby.capacity ? lobby.capacity : total;
}

/**
 * Result of `players.register()`. The plaintext `secret` is only ever
 * surfaced HERE, so store it locally on the device immediately. The next
 * call to `register()` for the same player returns 409
 * `player_already_registered`; lost-secret recovery is a studio-side
 * admin flow, not a client capability.
 */
export interface PlayerRegistration {
  playerId: string;
  externalPlayerId: string;
  secret: string;
  secretPrefix?: string | null;
  registeredAt?: string | null;
  /**
   * ISO-3166 alpha-2 country resolved server-side from the registration
   * request (e.g. `'PT'`); `null` when it couldn't be resolved. The client
   * never sends it — handy for rendering the player's own flag.
   */
  country?: string | null;
  /**
   * A stable, privacy-preserving fake identity the platform generates for
   * this player (name + optional avatar), drawn from the game's default
   * identity pool. Handy for greeting the player or showing them on a public
   * board without exposing their real profile. Also available after
   * `connectAsPlayer` as `kraty.syntheticIdentity`.
   */
  syntheticIdentity?: SyntheticIdentity | null;
  /**
   * Real display identity: the same shape as [[SyntheticIdentity]] but
   * enriched with `country` (identical on either view). Reflects
   * `setIdentity` if the player has renamed themselves; falls back to
   * the synthetic value otherwise. Prefer `players.getIdentity()` /
   * `players.getAnonymizedIdentity()` for reads.
   */
  displayIdentity?: PlayerIdentity | null;
  /**
   * Always the immutable synthetic-pool identity (name + optional
   * avatar + country). `setIdentity` never touches this; use it for
   * privacy-preserving views (public leaderboards, cross-game
   * aggregations).
   */
  anonymizedIdentity?: PlayerIdentity | null;
}

/** A generated fake name + avatar for a player (see {@link PlayerRegistration}). */
export interface SyntheticIdentity {
  name: string;
  avatar?: string | null;
}

/**
 * One row in the player's platform-managed inventory. Returned by
 * `GET /sdk/v1/players/:externalId/inventory`. The item's display
 * name and other catalog metadata live on the `items` table; the
 * SDK only carries the per-player quantity + free-form metadata
 * stamped on deposits.
 */
export interface PlayerItemHolding {
  itemKey: string;
  quantity: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * The game's daily login calendar as the player sees it
 * (`GET /sdk/v1/players/:p/daily-login`). Rewards are paid by the server
 * on the player's first session of each UTC day, as a grant with
 * `sourceKind: 'daily_login'`; this is what a client reads to draw the
 * calendar.
 */
export interface DailyLogin {
  /** Day 1 first; each day's reward entries as configured in the dashboard. */
  days: DailyLoginDay[];
  /** What a streak longer than the calendar does: start over, keep paying the last day, or stop. */
  afterLastDay: 'restart' | 'hold_last' | 'stop';
  /** Progression item holding `currentDay`, for clients already reading the wallet. */
  itemKey: string;
  /** Consecutive UTC days with a session; 0 once a day was missed. */
  loginStreak: number;
  /** Calendar day the player is on (1..days.length); 0 without a streak. */
  currentDay: number;
  /** Whether today's reward has been granted already. */
  paidToday: boolean;
  /** The grant that paid today, to match against the grant list or inventory stream. */
  todayGrantId: string | null;
  /** ISO start of the next UTC day: when the next day's reward can be earned. */
  nextDayAt: string;
}

export interface DailyLoginDay {
  day: number;
  /** Reward entries, e.g. `{ type: 'currency', currencyKey: 'gems', amount: 10 }`. */
  entries: Array<Record<string, unknown>>;
}

/**
 * One row in the player's wallet. Kind-agnostic: a `gold` currency
 * entry sits beside a `trophies` progression entry with the same
 * shape.
 */
export interface PlayerWalletHolding {
  economyKey: string;
  balance: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for `InventoryClient.consume`. The server requires
 * `idempotencyKey` for consume; the SDK auto-generates one if you
 * leave it null.
 */
export interface ConsumeItemInput {
  quantity: number;
  reason?: string;
  idempotencyKey?: string;
}

export interface ConsumeItemResult {
  itemKey: string;
  quantity: number;
  applied: boolean;
}

/**
 * Which storefront a purchase came from. `other` is the escape hatch
 * so an unenumerated store never blocks ingest.
 */
export type PurchaseStore =
  | 'app_store'
  | 'google_play'
  | 'steam'
  | 'epic'
  | 'amazon'
  | 'microsoft'
  | 'playstation'
  | 'nintendo'
  | 'web'
  | 'other';

export type PurchaseProductType = 'consumable' | 'non_consumable' | 'subscription';

/**
 * Server-side receipt validation state. Everything Kraty ingests today
 * lands `unverified` (or `skipped` for stores with no validation API);
 * a future validation pass flips it to `verified` / `failed`.
 */
export type PurchaseValidationStatus = 'unverified' | 'verified' | 'failed' | 'skipped';

/**
 * Input for `PurchasesClient.track` (a.k.a. `kraty.trackPurchase`).
 *
 * `amountMinor` is in the currency's MINOR units as charged — cents for
 * USD, whole yen for JPY. Every store SDK already reports minor units,
 * so pass theirs through unchanged rather than converting to a float.
 *
 * No `idempotencyKey`: `transactionId` IS the idempotency key, and it
 * comes from the store rather than being invented by the caller. Call
 * this as many times as you like for one transaction — a replay
 * records nothing new and moves no total.
 */
export interface TrackPurchaseInput {
  /** The store's transaction id. Used for dedupe. */
  transactionId: string;
  store: PurchaseStore;
  /** The store's product id / SKU. */
  productId: string;
  productType?: PurchaseProductType;
  /** Minor units as charged: `499` is $4.99 in USD, ¥499 in JPY. */
  amountMinor: number;
  /** ISO 4217 alpha-3, e.g. `'USD'`, `'BRL'`, `'JPY'`. */
  currency: string;
  /** Store receipt / purchase token, retained for later validation. */
  receipt?: string;
  /** ISO-8601. Defaults to the server's clock when omitted. */
  purchasedAt?: string;
  /** Arbitrary studio fields: campaign id, offer id, A/B bucket, … */
  metadata?: Record<string, unknown>;
}

/**
 * Result of `trackPurchase`. Carries both what the player was charged
 * (`amountMinor` + `currency`) and the normalized USD value
 * (`normalizedAmountMinor`, always USD cents) that spend thresholds
 * and revenue reporting compare against.
 */
export interface TrackPurchaseResult {
  purchaseId: string;
  transactionId: string;
  store: PurchaseStore;
  productId: string;
  productType: PurchaseProductType | null;
  amountMinor: number;
  currency: string;
  /** USD cents. */
  normalizedAmountMinor: number;
  /** Always `'USD'`. Present so callers never hardcode the base currency. */
  normalizedCurrency: string;
  fxRate: number;
  validationStatus: PurchaseValidationStatus;
  purchasedAt: string;
  metadata: Record<string, unknown>;
  /** True when this transaction id was already on file — a replay, not an error. */
  deduplicated: boolean;
  /** The player's lifetime spend in USD cents, after this purchase. */
  lifetimeAmountMinor: number;
  purchaseCount: number;
}

/**
 * Input for `WalletClient.debit`. Same idempotency story as
 * `ConsumeItemInput`. Credits are intentionally NOT in the client
 * SDK; only the studio's backend (`/server/v1/...`) can mint
 * balance, so a client SDK that exposed `credit` would invite money
 * printing.
 */
export interface DebitWalletInput {
  amount: number;
  reason?: string;
  idempotencyKey?: string;
}

export interface DebitWalletResult {
  economyKey: string;
  balance: number;
  applied: boolean;
}

/**
 * Input for `WalletClient.progress`. `amount` is signed: positive
 * advances, negative rolls back (never below zero).
 */
export interface ProgressWalletInput {
  amount: number;
  reason?: string;
  idempotencyKey?: string;
}

/**
 * A progression item the platform recomputed as a consequence of a
 * `progress` call — typically the player's `level` following their `xp`.
 * `grantIds` are the per-level rewards that fired; fetch them with
 * `grants.list()` / `grants.collectAll()`.
 */
export interface DerivedProgressionChange {
  economyKey: string;
  previous: number;
  current: number;
  delta: number;
  grantIds: string[];
}

export interface ProgressWalletResult {
  economyKey: string;
  balance: number;
  applied: boolean;
  /** Empty unless another item is configured to derive from this one. */
  derived: DerivedProgressionChange[];
}

// ── Friends / social graph ─────────────────────────────────────────────

/**
 * A confirmed friend, enriched with identity + live presence. Mirrors the
 * OpenAPI `Friend` component. `online` / `lastActiveAt` / `status` come
 * from the friend's heartbeat and are only fresh while they keep beating.
 */
export interface Friend {
  externalPlayerId: string;
  /** Progression balances requested via `friends.list({ progression: [...] })`,
   *  e.g. `{ level: 12 }`. Absent when none were requested; a resource the
   *  friend never touched reads 0. */
  progression?: Record<string, number>;
  displayIdentity: PlayerIdentity | null;
  /** ISO timestamp the friendship was established. */
  friendsSince: string;
  online: boolean;
  /** ISO timestamp of their last heartbeat, or null when never/expired. */
  lastActiveAt: string | null;
  /** Free-form client-set status ("in_match", "lobby", …), or null. */
  status: string | null;
  /** ISO timestamp when this friend may be gifted again. Absent means
   *  "giftable now" (or the game has gifting turned off), so a UI can treat
   *  presence-of-field as "disable the gift button until then". */
  giftCooldownUntil?: string;
}

/**
 * A suggested player to add — a recently-active non-friend the caller has
 * no relationship with. Same identity + live-presence shape as `Friend`,
 * minus the friendship-specific `friendsSince` / `giftCooldownUntil`
 * (there's no edge yet). Returned by `friends.suggestions()`.
 */
export interface Suggestion {
  externalPlayerId: string;
  displayIdentity: PlayerIdentity | null;
  online: boolean;
  /** ISO timestamp of their last heartbeat, or null when never/expired. */
  lastActiveAt: string | null;
  /** Free-form client-set status ("in_match", "lobby", …), or null. */
  status: string | null;
  /** Progression balances requested via
   *  `friends.suggestions({ progression: [...] })`, e.g. `{ level: 12 }`. */
  progression?: Record<string, number>;
}

/** The caller's shareable friend code + display identity. */
export interface FriendCode {
  friendCode: string;
  displayIdentity: PlayerIdentity | null;
  /** The caller's own progression balances, when requested via
   *  `friends.getCode({ progression: ['level'] })`. */
  progression?: Record<string, number>;
}

/** The player's own presence after a heartbeat. */
export interface PlayerPresence {
  online: boolean;
  lastActiveAt: string | null;
  status: string | null;
}

export type FriendRequestDirection = 'incoming' | 'outgoing';

/** A pending friend request, incoming or outgoing. */
export interface FriendRequest {
  requestId: string;
  direction: FriendRequestDirection;
  player: { externalPlayerId: string; displayIdentity: PlayerIdentity | null };
  createdAt: string;
}

export interface FriendRequests {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/** Add-or-block target: exactly one of the two identifiers. */
export type FriendTarget = { friendCode: string } | { externalPlayerId: string };

/**
 * Result of `friends.add`: either a newly-pending request, or an
 * immediately-accepted friendship when the other player had already
 * requested the caller (reciprocal auto-accept).
 */
export interface SendFriendRequestResult {
  status: 'pending' | 'accepted';
  request?: FriendRequest;
  friend?: Friend;
}

export type FriendRelationship =
  | 'none'
  | 'friends'
  | 'request_incoming'
  | 'request_outgoing';

/** A username-search hit + the caller's relationship to that player. */
export interface FriendSearchResult {
  externalPlayerId: string;
  displayIdentity: PlayerIdentity | null;
  relationship: FriendRelationship;
  /** Progression balances when requested via `friends.search(q, { progression })`. */
  progression?: Record<string, number>;
}

/** A player the caller has blocked. */
export interface BlockedPlayer {
  externalPlayerId: string;
  displayIdentity: PlayerIdentity | null;
  blockedAt: string;
}

// ── Friend gifting ─────────────────────────────────────────────────────

/**
 * What a gift moves. `'currency'` addresses `catalog.currencies`, which
 * covers progression items (XP, trophies) as well as spendable currencies —
 * the two share one catalog table.
 */
export type GiftResourceType = 'item' | 'currency';

/** One entry of the studio's gifting allowlist. */
export interface GiftableResource {
  type: GiftResourceType;
  key: string;
  /** Display name; a plain string, or a locale map for localized catalogs. */
  name: string | Record<string, string>;
  iconUrl: string | null;
  /** Economy rows only: spendable currency vs progression. */
  economyKind?: 'currency' | 'progression';
  /** Item rows only. */
  rarity?: string | null;
  /** Largest amount one gift of this resource may carry. */
  maxAmount: number;
  /** Whether sending debits the sender's own holdings. */
  costsSender: boolean;
}

/** The gifting allowlist plus the game's limits, from `friends.giftCatalog()`. */
export interface GiftCatalog {
  enabled: boolean;
  /** Wait between two gifts to the SAME friend. 0 ⇒ no per-pair wait. */
  cooldownSeconds: number;
  /** Rolling-24h cap across all friends; null ⇒ unlimited. */
  dailySendLimit: number | null;
  /** Gifts the caller already sent inside that window. */
  sentToday: number;
  resources: GiftableResource[];
}

export type GiftStatus = 'pending' | 'claimed' | 'expired' | 'failed';

/** A gift, from either side of the exchange. */
export interface Gift {
  giftId: string;
  /** The grant delivering it. Also claimable through `grants.claim`. */
  grantId: string;
  direction: 'incoming' | 'outgoing';
  /** The other party: sender for incoming, recipient for outgoing. */
  player: { externalPlayerId: string; displayIdentity: PlayerIdentity | null };
  type: GiftResourceType;
  resourceKey: string;
  amount: number;
  message: string | null;
  /** Mirrors the delivering grant: `pending` until claimed. */
  status: GiftStatus;
  sentAt: string;
  claimedAt: string | null;
  expiresAt: string | null;
}

/** What to send, and to whom. The target must be an accepted friend. */
export interface SendGiftInput {
  to: FriendTarget;
  type: GiftResourceType;
  /** Must name a catalog row the studio flagged giftable. */
  resourceKey: string;
  amount: number;
  /** Optional short note (trimmed to 140 chars server-side). */
  message?: string | null;
  /** Replay guard: a retry with the same key returns the original gift
   *  rather than tripping the cooldown. */
  idempotencyKey?: string;
}

// ─── Co-op & team events ───────────────────────────────────────────

/**
 * One of the player's team seats in an event window. Team events return it
 * on `events.listForPlayer`, `events.start`, `events.progress` and
 * `events.finish` (`teams`), so a team UI (score, goal bar or boss HP,
 * milestone chips, your contribution and rank) needs no extra call.
 */
export interface TeamSeatView {
  eventTeamId: string;
  teamKey: string;
  displayName: string;
  badge: string | null;
  formation: string;
  /** `'forming'` (partner invite pending) | `'active'` | `'closed'`. */
  status: 'forming' | 'active' | 'closed';
  score: number;
  memberCount: number;
  /** Null when the event has no team goal. `remaining` is the boss HP. */
  goal: { target: number; remaining: number; completed: boolean } | null;
  milestones: TeamSeatMilestone[];
  seat: TeamSeatState;
  /** The team board, once the team entered one. */
  leaderboardId: string | null;
  /** Your team's place on that board: live during the window, final after close. Null without a board. */
  boardRank: number | null;
  /**
   * Partner events: your roll-up bar over all your pairs (the same on each
   * of your seats) and its checkpoints. Null (or absent) without one.
   */
  rollup?: TeamRollup | null;
}

/** A partner event's per-player roll-up bar (e.g. Train Journey rails 3/6/9). */
export interface TeamRollup {
  value: number;
  milestones: Array<{ key: string; threshold: number; reached: boolean; paid: boolean }>;
}

/** `events.matchTeam`: your auto-matched team. */
export interface TeamMatchResult {
  windowId: string;
  eventTeamId: string;
  /** A new team was opened for you (false: you joined one, or already had one). */
  created: boolean;
  teams: TeamSeatView[];
}

/** A player on a partner invite or suggestion. */
export interface PartnerPlayer {
  externalPlayerId: string;
  displayIdentity: PlayerIdentity | null;
}

/** A partner invite (its id is the pair's `eventTeamId`). */
export interface PartnerInvite {
  eventTeamId: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  from: PartnerPlayer;
  to: PartnerPlayer;
  /** When a pending invite expires (ISO). */
  expiresAt: string | null;
  createdAt: string;
}

/** `events.randomPartner`: paired with someone waiting, or your bar waits for a partner. */
export interface RandomPartnerResult {
  status: 'paired' | 'waiting';
  eventTeamId: string;
  teams: TeamSeatView[];
}

/** `events.partnerSuggestions`: someone you could invite. */
export interface PartnerSuggestion {
  externalPlayerId: string;
  displayIdentity: PlayerIdentity | null;
  /** An accepted friend (friends are listed first). */
  isFriend: boolean;
}

/** One team milestone as one member sees it. */
export interface TeamSeatMilestone {
  key: string;
  /** After goal scaling. */
  threshold: number;
  unlocked: boolean;
  /** You were paid this tier. */
  paid: boolean;
  /** Unlocked while you were on the team; pays once your own contribution reaches the minimum. */
  pendingMinContribution: boolean;
}

/** Your seat on the team. */
export interface TeamSeatState {
  seatId: string;
  status: 'invited' | 'active' | 'left' | 'removed';
  contribution: number;
  /** Your 1-based rank inside the team. */
  rank: number;
  locked: boolean;
}

/** One teammate, as `events.teamMembers` returns them. */
export interface EventTeamMember {
  externalPlayerId: string | null;
  name: string | null;
  avatar: string | null;
  contribution: number;
  /** 1-based rank inside the team. */
  rank: number;
  status: 'invited' | 'active' | 'left' | 'removed';
  isSelf: boolean;
}

export interface EventTeamMembersPage {
  eventTeamId: string;
  teamKey: string;
  memberCount: number;
  members: EventTeamMember[];
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
}

// ── Guilds (docs/25) ───────────────────────────────────────────────────

/** The three fixed guild roles, highest first. */
export type GuildRole = 'leader' | 'co_leader' | 'member';

/** `open`: anyone eligible joins instantly. `request`: an officer approves. */
export type GuildJoinType = 'open' | 'request';

/** What a role may do; the game config decides for co-leaders and members. */
export type GuildPermission = 'accept_requests' | 'kick' | 'promote' | 'demote' | 'edit_profile';

/** Another player as guild screens show them. */
export interface GuildPlayerRef {
  externalPlayerId: string;
  displayIdentity: PlayerIdentity | null;
}

/** A guild card: search results, recommendations, profile headers. */
export interface GuildSummary {
  guildId: string;
  name: string;
  description: string | null;
  /** Free-form key your game maps to emblem art. */
  badge: string | null;
  /** ISO-3166-1 alpha-2 country code (`PT`, `US`), or null. */
  country: string | null;
  joinType: GuildJoinType;
  memberCount: number;
  /** The fixed Kraty limit (50). */
  maxMembers: number;
  metadata: Record<string, unknown>;
  leader: GuildPlayerRef | null;
  createdAt: string;
}

/** One member of a guild roster. */
export interface GuildMember {
  externalPlayerId: string;
  displayIdentity: PlayerIdentity | null;
  role: GuildRole;
  joinedAt: string;
  /** Last time the platform saw the player; officers judge activity by it. */
  lastSeenAt: string | null;
  online: boolean;
  /** Donations this member made in this guild this week. */
  weeklyHelps: number;
}

/** A guild with its roster (leader first, then co-leaders, members; longest-serving first). */
export interface GuildDetail {
  guildId: string;
  name: string;
  description: string | null;
  badge: string | null;
  country: string | null;
  joinType: GuildJoinType;
  memberCount: number;
  maxMembers: number;
  metadata: Record<string, unknown>;
  leader: GuildPlayerRef | null;
  createdAt: string;
  members: GuildMember[];
}

/** The player's guild, their role and permissions. */
export interface MyGuild {
  guild: GuildDetail;
  membership: { role: GuildRole; joinedAt: string; permissions: GuildPermission[] };
}

/** A recommended guild: a summary plus how many of your friends are in it. */
export interface RecommendedGuild {
  guildId: string;
  name: string;
  description: string | null;
  badge: string | null;
  country: string | null;
  joinType: GuildJoinType;
  memberCount: number;
  maxMembers: number;
  metadata: Record<string, unknown>;
  leader: GuildPlayerRef | null;
  createdAt: string;
  friendCount: number;
}

/** The unlock gate as it applies to this player. */
export interface GuildUnlockStatus {
  /** False until the studio picks an item: then there is no gate. */
  active: boolean;
  itemKey: string | null;
  threshold: number;
  /** Your balance of the item (null while the gate is inactive). */
  balance: number | null;
  eligible: boolean;
}

/** Help-request settings. */
export interface GuildHelpSettings {
  enabled: boolean;
  resources: Array<{ type: 'item' | 'currency'; key: string; maxPerRequest: number; costsDonor: boolean }>;
  requestCooldownSeconds: number;
  requestTtlHours: number;
  perDonationMax: number;
  /** Donations per player per guild week (the weekly helps counter); null = unlimited. */
  weeklyDonationLimit: number | null;
  donorReward: Array<Record<string, unknown>>;
}

/** When the guild week rolls over; the weekly donation cap counts over it. */
export interface GuildWeekSchedule {
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  hour: number;
  minute: number;
  timezone: string;
  currentStart: string;
  currentEnd: string;
}

/** The game's guild rules as this player sees them: build guild screens from it. */
export interface GuildClientConfig {
  enabled: true;
  maxMembers: number;
  defaultJoinType: GuildJoinType;
  roles: { leader: GuildPermission[]; coLeader: GuildPermission[]; member: GuildPermission[] };
  unlock: GuildUnlockStatus;
  createCost: Array<{ type: 'item' | 'currency'; key: string; amount: number }>;
  /**
   * Who takes `createCost` and donor-paid help (`help.resources[].costsDonor`)
   * from the player. `platform`: Kraty debits it when the guild is founded or
   * the donation is made. `studio`: your game manages inventory itself, so
   * Kraty charges nothing; charge the player yourself (before the call, or
   * from your backend on the `guild.created` / `guild.help_donated` webhooks).
   */
  costsChargedBy: 'platform' | 'studio';
  leaveCooldownHours: number;
  kickRejoinBlockHours: number;
  /** A request nobody answers expires `ttlHours` after its `createdAt`. */
  joinRequests: { declinedRetryHours: number; maxPendingPerPlayer: number; ttlHours: number };
  help: GuildHelpSettings;
  week: GuildWeekSchedule;
}

/** A request to join a `request`-type guild. */
export interface GuildJoinRequest {
  requestId: string;
  guild: { guildId: string; name: string; badge: string | null };
  /** The player asking. */
  player: GuildPlayerRef | null;
  message: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  createdAt: string;
  decidedAt: string | null;
}

/** A page of `guilds.searchPage` results. */
export interface GuildSearchPage {
  guilds: GuildSummary[];
  /** Pass as `offset` for the next page; null on the last page. */
  nextOffset: number | null;
}

/** `join` outcome: joined an open guild, or a request is waiting on a request guild. */
export interface GuildJoinResult {
  status: 'joined' | 'requested';
  guild?: MyGuild;
  request?: GuildJoinRequest;
}

export interface GuildLeaveResult {
  guildId: string;
  /** You were the last member: the guild is gone. */
  disbanded: boolean;
  /** Who leads now, when you were the leader. */
  newLeader: GuildPlayerRef | null;
}

export interface CreateGuildInput {
  name: string;
  description?: string | null;
  badge?: string | null;
  country?: string | null;
  joinType?: GuildJoinType;
  metadata?: Record<string, unknown>;
}

export type GuildProfilePatch = Partial<CreateGuildInput>;

export interface GuildHelpRequest {
  requestId: string;
  requester: GuildPlayerRef | null;
  type: 'item' | 'currency';
  resourceKey: string;
  amountRequested: number;
  amountReceived: number;
  /** `open` past its `expiresAt` reads as `expired`. */
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
  donatedByMe: boolean;
}

export interface GuildHelpOverview {
  requests: GuildHelpRequest[];
  myRequest: GuildHelpRequest | null;
  /** When you may ask again (null = now). */
  nextRequestAt: string | null;
  /** The weekly helps counter. */
  week: { start: string; end: string; donationsMade: number; donationLimit: number | null };
}

export interface GuildHelpDonation {
  donationId: string;
  requestId: string;
  amount: number;
  /** Grant delivering the donation to the requester. */
  grantId: string;
  /** Your reward grant, when the game pays one. */
  rewardGrantId: string | null;
  request: GuildHelpRequest;
  week: { donationsMade: number; donationLimit: number | null };
}

// ── Chat (docs: chat.mdx) ──────────────────────────────────────────────

/** How the profanity filter treats a conversation kind. */
export type ChatProfanityMode = 'always' | 'on_by_default' | 'off_by_default';

/** A player as chat shows them. */
export interface ChatPlayerRef {
  externalPlayerId: string;
  displayIdentity: { name: string; avatar?: string | null; country?: string | null } | null;
}

/** A message, resolved for the player reading it. */
export interface ChatMessage {
  messageId: string;
  conversationId: string;
  /** Gapless, ascending per conversation: the `before` / `after` cursor. */
  seq: number;
  /** `text`, `custom` (a game card) or `system` (written by Kraty). */
  type: 'text' | 'custom' | 'system';
  sender: { kind: 'player' | 'server' | 'system'; player: ChatPlayerRef | null };
  /** What this player sees: the filtered copy when their filter applies; null when deleted. */
  text: string | null;
  /** `text` is the masked copy. */
  filtered: boolean;
  /** `custom`: the card type. `system`: the event (`member_joined`, `gift_sent`, …). */
  customType: string | null;
  payload: unknown;
  replyToId: string | null;
  /** Echoed to the sender only. */
  clientMessageId: string | null;
  createdAt: string;
  /** When the sender last edited it; null = never. */
  editedAt: string | null;
  deleted: boolean;
}

/** A public channel the studio defined. */
export interface ChatChannel {
  key: string;
  name: string;
  description: string | null;
  /** `server_only`: announcements; players read but can't post. */
  postPolicy: 'players' | 'server_only';
  slowModeSeconds: number;
  /** Who may post (reading is open). */
  requirement: { itemKey: string; threshold: number } | null;
  metadata: Record<string, unknown>;
}

/** A conversation as the player sees it. */
export interface ChatConversation {
  conversationId: string;
  /** `direct`, `group`, `guild`, `channel` (open set). */
  kind: string;
  /** Group title, guild or channel name; null for direct (show `peer`). */
  title: string | null;
  metadata: Record<string, unknown>;
  memberCount: number;
  lastSeq: number;
  lastMessageAt: string | null;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  lastReadSeq: number;
  /** Notifications muted by the player until then. */
  mutedUntil: string | null;
  peer: (ChatPlayerRef & { online: boolean }) | null;
  guildId: string | null;
  channel: ChatChannel | null;
  /** The player's role here (group / guild role). */
  role: string | null;
  canPost: boolean;
  /** Why the player can't post (blocked, friends only, requirement, announcements…). */
  postDenied: { code: string; message: string; details?: Record<string, unknown> } | null;
  /** May delete other players' messages here. */
  canModerate: boolean;
  filterMode: ChatProfanityMode;
  createdAt: string;
}

export interface ChatMember {
  externalPlayerId: string;
  displayIdentity: ChatPlayerRef['displayIdentity'];
  role: string;
  joinedAt: string;
  online: boolean;
}

/** A conversation with its roster (direct and group; null for guild chat and channels). */
export type ChatConversationDetail = ChatConversation & ChatConversationMembers;

export interface ChatConversationMembers {
  members: ChatMember[] | null;
}

export interface ChatPreferences {
  /** null = each conversation kind's default. */
  profanityFilter: boolean | null;
  allowDirectFrom: 'everyone' | 'friends' | 'nobody';
}

/** A warning, chat mute or chat ban on the player. */
export interface Restriction {
  restrictionId: string;
  kind: 'warning' | 'chat_mute' | 'chat_ban';
  /** Show this to the player. */
  reason: string | null;
  source: 'moderator' | 'auto' | 'server';
  createdAt: string;
  expiresAt: string | null;
  liftedAt: string | null;
  acknowledgedAt: string | null;
  active: boolean;
  reportId: string | null;
}

/** The player's moderation standing. */
export interface ModerationStatus {
  canChat: boolean;
  canPost: boolean;
  mutedUntil: string | null;
  chatBannedUntil: string | null;
  restrictions: Restriction[];
}

/** The game's chat rules, as this player sees them. */
export interface ChatClientConfig {
  kinds: Record<string, { enabled: boolean; profanityFilter: string } & Record<string, unknown>>;
  channels: Array<ChatChannel & { profanityFilter: string }>;
  messages: ChatMessageRules;
  rateLimit: { messagesPerMinute: number };
  preferences: ChatPreferences;
  status: ModerationStatus;
}

/** Message limits and the game's custom card types. */
export interface ChatMessageRules {
  maxLength: number;
  allowLinks: boolean;
  customTypes: ChatCustomType[];
  /** Seconds after sending a player may edit; 0 = editing off. */
  editWindowSeconds: number;
}

export interface ChatCustomType {
  key: string;
  description: string | null;
  maxPayloadBytes: number;
  /** JSON Schema the payload must match, or null. */
  schema: unknown;
}

export interface ChatConversationPage {
  conversations: ChatConversation[];
  nextOffset: number | null;
}

export interface ChatMessagePage {
  /** Oldest to newest. */
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface ChatUnread {
  total: number;
  conversations: number;
  byKind: Record<string, number>;
}

export type ReportCategory =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'sexual_content'
  | 'violence'
  | 'self_harm'
  | 'cheating'
  | 'impersonation'
  | 'inappropriate_name'
  | 'other';

export interface ReportInput {
  targetExternalPlayerId: string;
  category: ReportCategory;
  context?: 'chat' | 'profile' | 'guild' | 'gameplay' | 'other';
  comment?: string | null;
  /** With `messageIds`: the conversation the reported messages are in. */
  conversationId?: string;
  messageIds?: string[];
  guildId?: string;
}

/** A report the player filed. */
export interface MyReport {
  reportId: string;
  targetExternalPlayerId: string;
  category: string;
  context: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}
