import { KratyClient, type KratyClientOptions } from './client.js';
import { KratyApiError } from './errors.js';
import {
  CatalogClient,
  EventLeaderboardsClient,
  EventsClient,
  FriendsClient,
  GrantsClient,
  InventoryClient,
  LeaderboardsClient,
  LobbiesClient,
  PlayersClient,
  PurchasesClient,
  WalletClient,
  pollLobbyUntilActive,
  pollPendingGrants,
} from './resources.js';
import type { SecretStore } from './secret-store.js';
import type { TrackPurchaseInput, TrackPurchaseResult } from './types.js';

export { KratyClient } from './client.js';
export type { KratyClientOptions, RetryConfig, RequestInfo, ServerTime } from './client.js';
export {
  CatalogClient,
  EventLeaderboardsClient,
  EventsClient,
  FriendsClient,
  GrantsClient,
  InventoryClient,
  LeaderboardsClient,
  LobbiesClient,
  PlayersClient,
  PurchasesClient,
  WalletClient,
  pollLobbyUntilActive,
  pollPendingGrants,
} from './resources.js';
export type {
  CollectAllFailure,
  CollectAllResult,
  PollLobbyOptions,
  PollPendingGrantsOptions,
} from './resources.js';
export {
  InMemorySecretStore,
  LocalStorageSecretStore,
} from './secret-store.js';
export type { SecretStore } from './secret-store.js';
export {
  openLeaderboardStream,
} from './leaderboard-stream.js';
export type {
  LeaderboardStream,
  LeaderboardStreamEvent,
  LeaderboardFinalizedData,
  LeaderboardStanding,
} from './leaderboard-stream.js';
export { openInventoryStream } from './inventory-stream.js';
export type {
  InventoryStream,
  InventoryStreamEvent,
  InventoryEventOrigin,
  InventoryChangedEvent,
  WalletChangedEvent,
  GrantCreatedEvent,
  InventoryReadyEvent,
} from './inventory-stream.js';
export { openSseStream } from './sse.js';
export type { SseEvent, SseStream } from './sse.js';
export {
  FinalizationTracker,
  InMemoryMembershipStore,
  LocalStorageMembershipStore,
  MembershipKind,
  FinalizationReason,
  StandingKind,
} from './finalization.js';
export type {
  MembershipStore,
  MembershipRef,
  EventLeaderboardRef,
  LeaderboardRef,
  TrackedMembership,
  FinalStanding,
  FinalizationResult,
  FinalizationListener,
  KeyValueStorage,
} from './finalization.js';
export {
  KratyApiError,
  KratyNetworkError,
  isLobbyForming,
} from './errors.js';
export type { KratyErrorCode, KratyErrorPayload } from './errors.js';
export {
  lobbyFilledSlots,
} from './types.js';
export type {
  Attempt,
  AttemptQuota,
  AttemptStatus,
  BlockedPlayer,
  BoardStandings,
  Catalog,
  CatalogCurrency,
  CatalogItem,
  ConsumeItemInput,
  ConsumeItemResult,
  DebitWalletInput,
  DebitWalletResult,
  EntryCost,
  EntryCostCurrency,
  EntryCostItem,
  EventListing,
  EventLeaderboard,
  EventLeaderboardReadOptions,
  FinishAttemptResponse,
  Friend,
  FriendCode,
  FriendRelationship,
  FriendRequest,
  FriendRequestDirection,
  FriendRequests,
  FriendSearchResult,
  FriendTarget,
  Gift,
  GiftCatalog,
  GiftableResource,
  GiftResourceType,
  GiftStatus,
  Grant,
  GrantEntryInput,
  GrantKind,
  GrantSelfInput,
  GrantStatus,
  Leaderboard,
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardPeriods,
  LeaderboardReadOptions,
  LeaderboardScoreResult,
  Lobby,
  LobbyStatus,
  MilestoneFired,
  MilestoneRewardPreview,
  OpenCrateResponse,
  PlayerContext,
  PlayerItemHolding,
  PlayerPresence,
  PlayerRegistration,
  PlayerWalletHolding,
  ProgressInput,
  ProgressResponse,
  PurchaseProductType,
  PurchaseStore,
  PurchaseValidationStatus,
  SendFriendRequestResult,
  SendGiftInput,
  RewardBundlePreview,
  RewardEntryPreview,
  RewardPolicySummary,
  StandingsReadOptions,
  StandingsScope,
  StandingsSegment,
  StartAttemptResponse,
  Suggestion,
  TrackPurchaseInput,
  TrackPurchaseResult,
} from './types.js';

/**
 * Convenience facade: instantiate one `Kraty` instead of wiring up
 * `KratyClient` + each resource client by hand. All resource clients
 * share the same underlying `KratyClient` so retry config, telemetry,
 * and the HTTP connection pool are shared.
 *
 * @example
 * ```ts
 * const kraty = new Kraty({ apiKey: '<your-client-sdk-key>' });
 * const events = await kraty.events.listForPlayer('player_42');
 * ```
 */
export class Kraty {
  readonly client: KratyClient;
  readonly events: EventsClient;
  readonly leaderboards: LeaderboardsClient;
  readonly eventLeaderboards: EventLeaderboardsClient;
  readonly grants: GrantsClient;
  readonly lobbies: LobbiesClient;
  readonly inventory: InventoryClient;
  readonly wallet: WalletClient;
  readonly players: PlayersClient;
  readonly purchases: PurchasesClient;
  readonly friends: FriendsClient;
  readonly catalog: CatalogClient;

  constructor(opts: KratyClientOptions) {
    this.client = new KratyClient(opts);
    this.events = new EventsClient(this.client);
    this.leaderboards = new LeaderboardsClient(this.client);
    this.eventLeaderboards = new EventLeaderboardsClient(this.client);
    this.grants = new GrantsClient(this.client);
    this.lobbies = new LobbiesClient(this.client);
    this.inventory = new InventoryClient(this.client);
    this.wallet = new WalletClient(this.client);
    this.players = new PlayersClient(this.client);
    this.purchases = new PurchasesClient(this.client);
    this.friends = new FriendsClient(this.client);
    this.catalog = new CatalogClient(this.client);
  }

  /**
   * Record a real-money purchase for the active player.
   *
   * Shorthand for `kraty.purchases.track(...)`, promoted to the top
   * level because reporting a purchase is a one-liner a game does from
   * inside its store callback and shouldn't have to reach through a
   * namespace for.
   *
   * ```ts
   * await kraty.trackPurchase({
   *   transactionId: storeTx.id,
   *   store: 'app_store',
   *   productId: 'gems_500',
   *   amountMinor: 499,   // $4.99 — minor units, as charged
   *   currency: 'USD',
   *   receipt: storeTx.receipt,
   * });
   * ```
   *
   * Idempotent on `transactionId`, so calling it on every restore
   * without tracking what you already reported is the intended usage.
   */
  async trackPurchase(
    input: TrackPurchaseInput,
    opts: { as?: string } = {},
  ): Promise<TrackPurchaseResult> {
    return this.purchases.track(input, opts);
  }

  /**
   * The active player this SDK is currently representing. Returns
   * `null` until the first player-scoped call resolves the
   * identity (or `ensureIdentity()` is awaited explicitly). The
   * field is mutable: it advances from `null` → a `kp_…` UUID on
   * fresh signups, or to a persisted id when one is recovered.
   */
  get activeExternalPlayerId(): string | null {
    return this.client.activeExternalPlayerId;
  }

  /**
   * The player's generated fake identity (`{ name, avatar }`) or null.
   * Populated after a fresh register (via `connectAsPlayer` or the first
   * player-scoped call that auto-registers). Use it to greet the player or
   * show them on a public board without their real profile:
   *
   * ```ts
   * const kraty = await Kraty.connectAsPlayer({ options, externalPlayerId, secretStore });
   * greet(kraty.syntheticIdentity?.name ?? 'Player'); // "Crazy Panda"
   * ```
   */
  get syntheticIdentity(): { name: string; avatar?: string | null } | null {
    return this.client.syntheticIdentity;
  }

  /**
   * Resolve the active player identity, registering a fresh one
   * if no persisted identity exists. Most games don't need to
   * call this; any player-scoped method (events, grants,
   * inventory, …) triggers it transparently. Reach for it only
   * when you want the id available before the first request (to
   * pre-greet the player by id, say).
   */
  ensureIdentity(): ReturnType<KratyClient['ensureIdentity']> {
    return this.client.ensureIdentity();
  }

  /**
   * Forget the persisted identity. The next player-scoped call
   * lazily registers a new player (or resumes a different id if
   * the SecretStore holds one). Drop-in for a "sign out" button.
   */
  logout(): Promise<void> {
    return this.client.logout();
  }

  /**
   * Finalization catch-up (docs/05b). `onFinalized` fires when a board the
   * player is in ends: live over SSE while subscribed, OR via
   * `checkFinalizations()` for boards that finalized while they were away
   * (call it on app foreground / reconnect). Both paths deliver exactly once.
   * `dismiss`/`clearReported` acknowledge handled results so they leave storage.
   */
  onFinalized(cb: Parameters<KratyClient['onFinalized']>[0]): () => void {
    return this.client.onFinalized(cb);
  }
  checkFinalizations(): ReturnType<KratyClient['checkFinalizations']> {
    return this.client.checkFinalizations();
  }
  dismiss(ref: Parameters<KratyClient['dismiss']>[0]): Promise<void> {
    return this.client.dismiss(ref);
  }
  clearReported(): Promise<number> {
    return this.client.clearReported();
  }

  /**
   * Server clock. Fetch the backend's time so game timers can't be cheated by
   * changing the device clock. `getServerTime()` is a one-shot fetch;
   * `syncTime()` + `serverNow()` give a tamper-proof local clock anchored to
   * the server via a monotonic reference (call `syncTime()` at startup + on
   * resume). Compare `serverNow()`/`epochMs` against event `endsAt`.
   */
  getServerTime(opts?: Parameters<KratyClient['getServerTime']>[0]): ReturnType<KratyClient['getServerTime']> {
    return this.client.getServerTime(opts);
  }
  syncTime(): Promise<void> {
    return this.client.syncTime();
  }
  get isTimeSynced(): boolean {
    return this.client.isTimeSynced;
  }
  serverNowMs(): number {
    return this.client.serverNowMs();
  }
  serverNow(): Date {
    return this.client.serverNow();
  }

  /**
   * Install an explicit identity on this SDK and persist it.
   * Use when your own auth gave you back a Kraty
   * `externalPlayerId` + `secret`, e.g. on a new device after a
   * server-side device-link flow.
   */
  signIn(identity: { externalPlayerId: string; secret: string }): Promise<void> {
    return this.client.signIn(identity);
  }

  /**
   * Adaptive polling helper bound to this instance's grants client.
   * Defaults to the active player; pass `{ as }` to poll a different
   * player.
   */
  pollPendingGrants(
    opts?: Parameters<typeof pollPendingGrants>[1],
  ): Promise<void> {
    return pollPendingGrants(this.grants, opts);
  }

  /** Polls a lobby until it transitions out of `'forming'`. */
  pollLobbyUntilActive(
    lobbyId: string,
    opts?: Parameters<typeof pollLobbyUntilActive>[2],
  ): ReturnType<typeof pollLobbyUntilActive> {
    return pollLobbyUntilActive(this.lobbies, lobbyId, opts);
  }

  /**
   * Bootstrap a player-authenticated `Kraty` in one call. Reads the
   * stored secret from `secretStore`, registers if absent, retries
   * with `force: true` on a `player_already_registered` 409 (dev/test
   * envs only; production keys reject `force` and the 409 surfaces
   * to the caller for a real account-recovery flow), persists the
   * secret back to the store, and returns a `Kraty` wired with the
   * secret on every subsequent request.
   *
   * Use this instead of `new Kraty(...)` when the consumer is a game
   * client that just wants "give me a working SDK for this player."
   * For server-side use (where there's no player concept) keep using
   * the constructor with `playerSecret` unset.
   *
   * Throws `KratyApiError` on unrecoverable failures (e.g. wrong SDK
   * key → 401 `session_invalid`, or a 409 on a live env).
   */
  static async connectAsPlayer(args: {
    options: KratyClientOptions;
    externalPlayerId: string;
    secretStore: SecretStore;
    /**
     * When true (default), retry register with `force: true` on 409.
     * Set false to surface the 409 to your own recovery UX instead.
     * Production `client_sdk` keys reject `force`, so a `live` SDK
     * key surfaces the 409 even with this true.
     */
    autoRotateOnConflict?: boolean;
  }): Promise<Kraty> {
    const { options, externalPlayerId, secretStore } = args;
    const autoRotate = args.autoRotateOnConflict ?? true;

    const stored = await secretStore.read(externalPlayerId);
    if (stored && stored.length > 0) {
      // Happy path: secret already on this device, so wire up
      // immediately, no register round-trip needed.
      await secretStore.writeActiveExternalPlayerId?.(externalPlayerId);
      return new Kraty({
        ...options,
        playerSecret: stored,
        activeExternalPlayerId: externalPlayerId,
      });
    }

    // First-launch / wiped-data path: register, store, re-wire.
    const preRegister = new Kraty({ ...options, playerSecret: undefined });
    let reg;
    try {
      reg = await preRegister.players.register(externalPlayerId);
    } catch (err) {
      if (
        autoRotate &&
        err instanceof KratyApiError &&
        err.isPlayerAlreadyRegistered
      ) {
        reg = await preRegister.players.register(externalPlayerId, { force: true });
      } else {
        throw err;
      }
    }
    await secretStore.write(externalPlayerId, reg.secret);
    await secretStore.writeActiveExternalPlayerId?.(externalPlayerId);
    const kraty = new Kraty({
      ...options,
      playerSecret: reg.secret,
      activeExternalPlayerId: externalPlayerId,
    });
    // Carry the fake identity the register response minted so
    // `kraty.syntheticIdentity` is populated on this happy path.
    kraty.client.setSyntheticIdentity(reg.syntheticIdentity ?? null);
    return kraty;
  }

  /**
   * Recover the active player identity from a `SecretStore`. Returns
   * `{ externalPlayerId, secret }` when the device has previously
   * connected, or `null` when it hasn't (fresh install, post-logout).
   *
   * Typical use: at app boot, read the stored identity to decide
   * whether to render the "tap to play" guest screen or jump straight
   * into the authenticated session.
   *
   * ```ts
   * const stored = await Kraty.readStoredIdentity(secretStore);
   * if (stored) {
   *   const kraty = new Kraty({ apiKey, playerSecret: stored.secret });
   *   return startGame(stored.externalPlayerId, kraty);
   * }
   * return showOnboarding();
   * ```
   */
  static async readStoredIdentity(
    secretStore: SecretStore,
  ): Promise<{ externalPlayerId: string; secret: string } | null> {
    if (!secretStore.readActiveExternalPlayerId) return null;
    const externalPlayerId = await secretStore.readActiveExternalPlayerId();
    if (!externalPlayerId) return null;
    const secret = await secretStore.read(externalPlayerId);
    if (!secret) return null;
    return { externalPlayerId, secret };
  }

  /**
   * Write a `(externalPlayerId, secret)` pair back into the store
   * as the active identity. Used by recovery flows; e.g. studio
   * support hands the player a one-shot reissued secret, the client
   * stamps it into the store and resumes play.
   *
   * Does NOT validate the secret with the server. If the pair turns
   * out to be wrong, the next authenticated request will 401
   * `player_secret_invalid`; the consumer should catch that and
   * fall back to the register flow.
   */
  static async restoreStoredIdentity(
    secretStore: SecretStore,
    identity: { externalPlayerId: string; secret: string },
  ): Promise<void> {
    await secretStore.write(identity.externalPlayerId, identity.secret);
    await secretStore.writeActiveExternalPlayerId?.(identity.externalPlayerId);
  }

  /**
   * Clear the active identity pointer (logout). The underlying
   * secret stays in the store unless the caller also `.remove()`s
   * it explicitly, useful if your UX wants "switch account" to
   * remember credentials for both players and just swap which is
   * active.
   */
  static async clearStoredIdentity(secretStore: SecretStore): Promise<void> {
    await secretStore.clearActiveExternalPlayerId?.();
  }
}
