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

export interface LeaderboardReadOptions {
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
