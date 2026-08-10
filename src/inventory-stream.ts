import { openSseStream, type SseStream } from './sse.js';

/**
 * Live feed of everything that touches a player's items, wallet, and
 * grants — no matter who caused it.
 *
 * Before this, a game only saw changes it made itself: a reward granted
 * from the dashboard, a currency credited by the studio's backend, or an
 * event payout landed in the database and the running client kept showing
 * stale numbers until the next launch.
 *
 * Consume it as an async iterable (`for await`) or hand it to
 * {@link InventoryClient.watch} for a plain callback.
 */

/** Who caused a change; lets a client ignore the echo of its own writes. */
export type InventoryEventOrigin = 'client' | 'server' | 'admin' | 'engine';

/** An item's quantity changed. */
export interface InventoryChangedEvent {
  kind: 'inventory_changed';
  itemKey: string;
  /** Signed change; negative for a consume. */
  delta: number;
  /** Quantity AFTER the change. */
  quantity: number;
  /** Ledger reason (`grant_deposit`, `consume`, `admin_grant`, …). */
  reason: string;
  origin: InventoryEventOrigin;
  ledgerId: string;
  occurredAt: string;
}

/** A currency / progression balance changed. */
export interface WalletChangedEvent {
  kind: 'wallet_changed';
  economyKey: string;
  delta: number;
  /** Balance AFTER the change. */
  balance: number;
  reason: string;
  origin: InventoryEventOrigin;
  ledgerId: string;
  occurredAt: string;
}

/**
 * A grant became available (event reward, level-up payout, admin
 * make-good). Call `grants.collectAll()` to claim it; `contents` is
 * enough to render the "you got something" popup immediately.
 */
export interface GrantCreatedEvent {
  kind: 'grant_created';
  grantId: string;
  grantKind: 'reward' | 'crate';
  sourceKind: string;
  contents: Record<string, unknown>;
  occurredAt: string;
}

/** Handshake, sent once the subscription is wired. */
export interface InventoryReadyEvent {
  kind: 'ready';
  externalPlayerId: string;
}

export type InventoryStreamEvent =
  | InventoryReadyEvent
  | InventoryChangedEvent
  | WalletChangedEvent
  | GrantCreatedEvent;

/** Handle to an open inventory subscription. `close()` is idempotent. */
export interface InventoryStream {
  events: AsyncIterable<InventoryStreamEvent>;
  close(): Promise<void>;
}

interface OpenArgs {
  fetchImpl: typeof fetch;
  baseUrl: string;
  externalPlayerId: string;
  authHeader: string;
  playerSecret: string | null;
  sdkUserAgent: string;
}

export async function openInventoryStream(args: OpenArgs): Promise<InventoryStream> {
  const raw: SseStream = await openSseStream({
    fetchImpl: args.fetchImpl,
    url: `${args.baseUrl}/sdk/v1/players/${encodeURIComponent(args.externalPlayerId)}/inventory/stream`,
    authHeader: args.authHeader,
    playerSecret: args.playerSecret,
    sdkUserAgent: args.sdkUserAgent,
    label: 'inventory stream',
  });

  // The wire events already carry their own `kind`, so narrowing is just a
  // matter of trusting the discriminator the server sent. Unknown kinds
  // (a newer backend) are passed through rather than dropped, so a client
  // built against an older SDK still sees them if it wants to.
  async function* iterate(): AsyncGenerator<InventoryStreamEvent, void, unknown> {
    for await (const ev of raw.events) {
      yield { ...(ev.data as Record<string, unknown>), kind: ev.kind } as InventoryStreamEvent;
    }
  }

  return { events: iterate(), close: () => raw.close() };
}
