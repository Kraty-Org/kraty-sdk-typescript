/**
 * Sealed-ish set of error codes the backend returns on the
 * `/sdk/v1` surface. Mirrors `apps/backend/src/api/errors.ts`.
 *
 * The union is intentionally open at the end (`| (string & {})`
 * effectively, via the `code` field being typed as
 * `KratyErrorCode | string`) so a backend code the SDK hasn't been
 * updated to know about still type-checks rather than blowing up.
 */
export type KratyErrorCode =
  // ── core ───────────────────────────────────────────────────────
  | 'unauthenticated'
  | 'session_invalid'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'rate_limited'
  | 'internal_error'
  | 'tenant_mismatch'
  | 'idempotency_conflict'
  // ── per-player auth ────────────────────────────────────────────
  | 'player_secret_invalid'
  | 'player_already_registered'
  | 'player_banned'
  | 'anti_cheat_rejected'
  // ── events / attempts ──────────────────────────────────────────
  | 'event_disabled'
  | 'no_active_window'
  | 'no_leaderboard'
  | 'max_attempts_reached'
  | 'max_daily_attempts_reached'
  | 'attempt_finished'
  | 'invalid_metric'
  | 'unlock_condition_failed'
  | 'invalid_unlock_condition'
  // ── entry requirements / cost ──────────────────────────────────
  | 'entry_requirement_failed'
  | 'invalid_entry_requirement'
  | 'insufficient_entry_cost'
  // ── matchmaking ────────────────────────────────────────────────
  | 'lobby_forming'
  // ── inventory ──────────────────────────────────────────────────
  | 'inventory_not_permissive';

export interface KratyErrorPayload {
  code: KratyErrorCode | string;
  message: string;
  details?: unknown;
}

/**
 * Thrown for every non-2xx response (and the 202 lobby-forming case).
 * `status` is the HTTP status, `code` / `message` come from the
 * backend's `{ error: { code, message, details? } }` envelope. Network
 * failures throw `KratyNetworkError` instead.
 *
 * Use the typed `is...` getters to switch on a code; they're cheaper
 * to read than a chain of string comparisons and immune to typos. One
 * getter exists per code in `KratyErrorCode`; if you need to match on
 * a code the SDK hasn't bumped to yet, use the generic `err.is(code)`.
 */
export class KratyApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: KratyErrorCode | string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(`[${status}] ${code}: ${message}`);
    this.name = 'KratyApiError';
  }

  /**
   * Generic code matcher. Useful when you want to switch on a code
   * the SDK doesn't yet have a typed getter for (e.g. a new code
   * the backend added before an SDK release).
   *
   * ```ts
   * if (err.is('event_disabled')) showEventDisabledDialog();
   * ```
   */
  is(code: KratyErrorCode | string): boolean {
    return this.code === code;
  }

  // ── core ─────────────────────────────────────────────────────────

  /** 401: `Authorization` header missing on a protected route. */
  get isUnauthenticated(): boolean { return this.code === 'unauthenticated'; }

  /** 401: Bearer token is malformed, revoked, or rejected. */
  get isSessionInvalid(): boolean { return this.code === 'session_invalid'; }

  /** 403: authenticated but lacks the permission for this route. */
  get isForbidden(): boolean { return this.code === 'forbidden'; }

  /** 404: referenced resource doesn't exist or is archived. */
  get isNotFound(): boolean { return this.code === 'not_found'; }

  /** 400: request body / query failed schema validation. `details` carries the field-level errors. */
  get isValidationFailed(): boolean { return this.code === 'validation_failed'; }

  /**
   * 409: generic mutation conflict (wallet debit on 0 balance,
   * unknown policy type, etc.). More specific 409 codes get their
   * own getters; this catches the rest.
   */
  get isConflict(): boolean { return this.code === 'conflict'; }

  /**
   * 429: per-key rate limit exceeded. `Retry-After` header carries
   * the wait. The SDK auto-retries with backoff before surfacing
   * this; by the time you see it, the retry budget is exhausted.
   */
  get isRateLimited(): boolean { return this.code === 'rate_limited'; }

  /** 500: unhandled exception. Surface a generic "something went wrong" to the player. */
  get isInternalError(): boolean { return this.code === 'internal_error'; }

  /** 403: cross-studio access attempt (RLS rejected the row). Shouldn't happen via the SDK. */
  get isTenantMismatch(): boolean { return this.code === 'tenant_mismatch'; }

  /**
   * 409: same `idempotencyKey` used with a different request body
   * within the 24h cache TTL. Reusing keys can't silently corrupt
   * state; the SDK auto-stamps fresh keys per write so you only see
   * this when you've supplied your own key.
   */
  get isIdempotencyConflict(): boolean { return this.code === 'idempotency_conflict'; }

  // ── per-player auth ──────────────────────────────────────────────

  /**
   * 401: `X-Player-Secret` is missing, malformed, or doesn't match
   * the stored hash for the player. Triggers your re-authentication
   * flow (`kraty.logout()` and then either auto-recover or surface
   * a sign-in UI that calls `kraty.signIn` with a server-issued
   * secret).
   */
  get isPlayerSecretInvalid(): boolean { return this.code === 'player_secret_invalid'; }
  /** `true` when the player has been soft-banned by the studio. */
  get isPlayerBanned(): boolean { return this.code === 'player_banned'; }
  /**
   * `true` when a server-side anti-cheat validator rejected this
   * progress write. The write was rolled back; show the player a
   * generic "couldn't record progress" UX and let your backend
   * investigate via the audit trail.
   */
  get isAntiCheatRejected(): boolean { return this.code === 'anti_cheat_rejected'; }

  /**
   * 409: the player already has a registered secret. Route to
   * your account-recovery flow; dev/test environments can re-issue
   * the secret with `?force=true` on the register endpoint, but
   * production `client_sdk` keys reject `force` so a real recovery
   * UX has to live in your own backend.
   */
  get isPlayerAlreadyRegistered(): boolean { return this.code === 'player_already_registered'; }

  /**
   * 403: `grants.grant` (a client-side grant) on a game whose inventory
   * management isn't `permissive`. Enable it in the game's Settings, or
   * create grants from your backend with a `server_integration` key.
   */
  get isInventoryNotPermissive(): boolean { return this.code === 'inventory_not_permissive'; }

  // ── events / attempts ────────────────────────────────────────────

  /** 409: the event is configured but disabled. Surface a "coming soon" state. */
  get isEventDisabled(): boolean { return this.code === 'event_disabled'; }

  /** 409: the event has no currently-active window. Player is between scheduled windows. */
  get isNoActiveWindow(): boolean { return this.code === 'no_active_window'; }

  /** 503: server couldn't allocate/find the leaderboard. Usually transient; retry after backoff. */
  get isNoLeaderboard(): boolean { return this.code === 'no_leaderboard'; }

  /** 429: player burned all attempts for the current event window. */
  get isMaxAttemptsReached(): boolean { return this.code === 'max_attempts_reached'; }

  /** 429: per-day attempt cap reached. Player should wait until midnight in the event's timezone. */
  get isMaxDailyAttemptsReached(): boolean { return this.code === 'max_daily_attempts_reached'; }

  /** 409: reported progress on an attempt that's already `completed` / `expired`. Refresh state. */
  get isAttemptFinished(): boolean { return this.code === 'attempt_finished'; }

  /** 400: `progress` referenced a metric key the event doesn't declare. SDK / game-config bug. */
  get isInvalidMetric(): boolean { return this.code === 'invalid_metric'; }

  /** 403: player can't see the event yet (visibility gate / unlock condition failed). */
  get isUnlockConditionFailed(): boolean { return this.code === 'unlock_condition_failed'; }

  /** 500: event config has a malformed unlock condition tree. Operator should fix in the portal. */
  get isInvalidUnlockCondition(): boolean { return this.code === 'invalid_unlock_condition'; }

  // ── entry requirements / cost ────────────────────────────────────

  /**
   * 403: player attempted an event whose entry requirement failed
   * (e.g. "must own item X"). Show a locked-event dialog or surface
   * what's missing from the message.
   */
  get isEntryRequirementFailed(): boolean { return this.code === 'entry_requirement_failed'; }

  /** 500: event config has a malformed entry requirement. Operator should fix. */
  get isInvalidEntryRequirement(): boolean { return this.code === 'invalid_entry_requirement'; }

  /**
   * 402: paid event the player can't afford. `message` names the
   * shortfall resource ("not enough cash to enter, need 50").
   * Surface a "buy more X" prompt or a free-event fallback. The
   * server's atomic debit was rolled back, so partial spends never
   * persist.
   */
  get isInsufficientEntryCost(): boolean { return this.code === 'insufficient_entry_cost'; }

  // ── matchmaking ──────────────────────────────────────────────────

  /**
   * 202: lobby-matched event whose lobby isn't yet at capacity.
   * Not a hard failure: poll the lobby endpoint (using `details.lobbyId`)
   * and retry `events.start` once it transitions out of `forming`.
   */
  get isLobbyForming(): boolean { return this.code === 'lobby_forming'; }
}

/**
 * Network / fetch-layer failure that didn't produce an HTTP response
 * (DNS, socket reset, abort, timeout). The SDK auto-retries network
 * errors with backoff before surfacing this; by the time you see
 * one, the retry budget is exhausted.
 */
export class KratyNetworkError extends Error {
  public readonly originalCause?: unknown;
  constructor(message: string, originalCause?: unknown) {
    super(message);
    this.name = 'KratyNetworkError';
    if (originalCause !== undefined) this.originalCause = originalCause;
  }
}

/**
 * @deprecated Use `err.isLobbyForming` getter on `KratyApiError`
 * instead. Kept for back-compat with v0.x consumers.
 */
export function isLobbyForming(err: unknown): err is KratyApiError {
  return err instanceof KratyApiError && err.code === 'lobby_forming';
}
