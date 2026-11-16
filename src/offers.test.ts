import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kraty, canonicalTransactionId } from './index.js';

/** OffersClient (docs/26): paths, bodies, idempotency keys, and offer purchases. */

interface FakeCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function makeFetch(responses: Array<() => Response | Promise<Response>>) {
  const calls: FakeCall[] = [];
  let i = 0;
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>),
      ),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const factory = responses[i++];
    if (!factory) throw new Error(`fake fetch exhausted; got call ${i}`);
    return await factory();
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const baseOpts = (fetchImpl: typeof fetch) => ({
  apiKey: 'pUUVdrM8.djr4-0Iv9h1JvVNSMZNDmSsSN7lSVq2F9dG6DG4A5uQ',
  baseUrl: 'https://api.test.kraty.io',
  fetch: fetchImpl,
  playerSecret: 'sekret',
  activeExternalPlayerId: 'alice',
  generateIdempotencyKey: () => 'idem-1',
  retry: { attempts: 1, initialDelayMs: 1, maxDelayMs: 5, jitter: 0 },
  timeoutMs: 1_000,
});

const INSTANCE = '7b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const offer = {
  instanceId: INSTANCE,
  offerKey: 'starter',
  kind: 'starter_pack',
  name: 'Starter pack',
  description: null,
  state: 'available',
  tier: 0,
  tierCount: 1,
  current: {
    index: 0,
    storeProductKey: 'starter_499',
    skus: { app_store: 'com.game.starter499', google_play: 'starter_499' },
    referencePriceMinor: 499,
    contents: [{ type: 'currency', currencyKey: 'gems', amount: 500 }],
    label: null,
    valueLabel: '5x value',
  },
  next: null,
  expiresAt: '2026-10-16T12:00:00.000Z',
  tierExpiresAt: null,
  endsWithSession: false,
  purchasesRemaining: 1,
  presentation: { layout: 'popup' },
  variantKey: null,
  linkedEventKey: null,
};

afterEach(() => vi.restoreAllMocks());

describe('OffersClient', () => {
  it('list GETs the active player\'s offers and unwraps them', async () => {
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: [offer] })]);
    const kraty = new Kraty(baseOpts(fetch));
    const out = await kraty.offers.list();
    expect(out).toEqual([offer]);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.test.kraty.io/sdk/v1/players/alice/offers');
    expect(calls[0]!.headers['X-Player-Secret'] ?? calls[0]!.headers['x-player-secret']).toBe('sekret');
  });

  it('list passes limit and level as query parameters, and honours `as`', async () => {
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: [] })]);
    const kraty = new Kraty(baseOpts(fetch));
    await kraty.offers.list({ limit: 5, level: 12, as: 'bob' });
    expect(calls[0]!.url).toBe('https://api.test.kraty.io/sdk/v1/players/bob/offers?limit=5&level=12');
  });

  it('markShown POSTs the impression with a generated idempotency key', async () => {
    const result = {
      offer: { ...offer, state: 'shown' },
      firstImpression: true,
      capped: false,
      cappedReason: null,
      retryAt: null,
    };
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: result })]);
    const kraty = new Kraty(baseOpts(fetch));
    const out = await kraty.offers.markShown(INSTANCE);
    expect(out).toEqual(result);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(
      `https://api.test.kraty.io/sdk/v1/players/alice/offers/${INSTANCE}/impression`,
    );
    expect(calls[0]!.body).toEqual({ idempotencyKey: 'idem-1' });
  });

  it('markShown keeps a caller-supplied idempotency key', async () => {
    const { fetch, calls } = makeFetch([
      () =>
        jsonRes(200, {
          data: { offer, firstImpression: false, capped: true, cappedReason: 'offer_day', retryAt: '2026-10-17T00:00:00.000Z' },
        }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    const out = await kraty.offers.markShown(INSTANCE, { idempotencyKey: 'mine' });
    expect(out.capped).toBe(true);
    expect(out.cappedReason).toBe('offer_day');
    expect(calls[0]!.body).toEqual({ idempotencyKey: 'mine' });
  });

  it('markShown surfaces a game-wide cap with its reason and retryAt (Revision 4)', async () => {
    const { fetch } = makeFetch([
      () =>
        jsonRes(200, {
          data: {
            offer,
            firstImpression: false,
            capped: true,
            cappedReason: 'global_gap',
            retryAt: '2026-10-16T12:02:00.000Z',
          },
        }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    const out = await kraty.offers.markShown(INSTANCE);
    expect(out).toMatchObject({ capped: true, cappedReason: 'global_gap', retryAt: '2026-10-16T12:02:00.000Z' });
  });

  it('list returns the variant and linked event of each offer (Revision 4)', async () => {
    const tested = { ...offer, variantKey: 'b', linkedEventKey: 'lava_quest' };
    const { fetch } = makeFetch([() => jsonRes(200, { data: [tested, offer] })]);
    const kraty = new Kraty(baseOpts(fetch));
    const out = await kraty.offers.list();
    expect(out[0]!.variantKey).toBe('b');
    expect(out[0]!.linkedEventKey).toBe('lava_quest');
    expect(out[1]!.variantKey).toBeNull();
    expect(out[1]!.linkedEventKey).toBeNull();
  });

  it('dismiss POSTs to the instance and returns the offer after it', async () => {
    const after = { ...offer, state: 'dismissed' };
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: after })]);
    const kraty = new Kraty(baseOpts(fetch));
    const out = await kraty.offers.dismiss(INSTANCE);
    expect(out.state).toBe('dismissed');
    expect(calls[0]!.url).toBe(
      `https://api.test.kraty.io/sdk/v1/players/alice/offers/${INSTANCE}/dismiss`,
    );
    expect(calls[0]!.body).toEqual({ idempotencyKey: 'idem-1' });
  });

  it('trigger POSTs the trigger with a generated idempotency key and unwraps the armed offers', async () => {
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: { offers: [offer] } })]);
    const kraty = new Kraty(baseOpts(fetch));
    const out = await kraty.offers.trigger({ type: 'fail_event', key: 'level_failed', consecutive: 2 });
    expect(out.offers).toEqual([offer]);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.test.kraty.io/sdk/v1/players/alice/offers/triggers');
    expect(calls[0]!.body).toEqual({
      trigger: { type: 'fail_event', key: 'level_failed', consecutive: 2 },
      idempotencyKey: 'idem-1',
    });
  });

  it('trigger passes playerContext and a caller key, and honours `as`', async () => {
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: { offers: [] } })]);
    const kraty = new Kraty(baseOpts(fetch));
    const out = await kraty.offers.trigger(
      { type: 'resource_depleted', resource: 'lives', required: 1, available: 0, secondsToRegen: 900 },
      { playerContext: { level: 12 }, idempotencyKey: 'mine', as: 'bob' },
    );
    expect(out.offers).toEqual([]);
    expect(calls[0]!.url).toBe('https://api.test.kraty.io/sdk/v1/players/bob/offers/triggers');
    expect(calls[0]!.body).toEqual({
      trigger: { type: 'resource_depleted', resource: 'lives', required: 1, available: 0, secondsToRegen: 900 },
      playerContext: { level: 12 },
      idempotencyKey: 'mine',
    });
  });

  it('trackPurchase sends offerInstanceId and surfaces the attributed offer', async () => {
    const purchase = {
      purchaseId: 'p-1',
      transactionId: '2000000123456789',
      store: 'app_store',
      productId: 'com.game.starter499',
      productType: 'consumable',
      amountMinor: 499,
      currency: 'USD',
      normalizedAmountMinor: 499,
      normalizedCurrency: 'USD',
      fxRate: 1,
      validationStatus: 'skipped',
      purchasedAt: '2026-10-15T12:00:00.000Z',
      metadata: {},
      deduplicated: false,
      lifetimeAmountMinor: 499,
      purchaseCount: 1,
      offer: {
        offerId: 'o-1',
        offerKey: 'starter',
        instanceId: INSTANCE,
        tier: 0,
        method: 'explicit',
        status: 'attributed',
        state: 'purchased',
        granted: false,
        pendingVerification: false,
        studioFulfils: true,
        contents: offer.current.contents,
        validationStatus: 'skipped',
      },
    };
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: purchase })]);
    const kraty = new Kraty(baseOpts(fetch));
    const out = await kraty.trackPurchase({
      transactionId: '2000000123456789',
      store: 'app_store',
      productId: 'com.game.starter499',
      amountMinor: 499,
      currency: 'USD',
      offerInstanceId: INSTANCE,
    });
    expect(calls[0]!.url).toBe('https://api.test.kraty.io/sdk/v1/players/alice/purchases');
    expect((calls[0]!.body as Record<string, unknown>)['offerInstanceId']).toBe(INSTANCE);
    expect(out.offer?.studioFulfils).toBe(true);
    expect(out.offer?.contents).toEqual(offer.current.contents);
  });
});

const freeTier = {
  index: 1,
  type: 'free',
  storeProductKey: null,
  skus: {},
  referencePriceMinor: 0,
  contents: [{ type: 'currency', currencyKey: 'coins', amount: 250 }],
  label: null,
  valueLabel: null,
};

const chainOffer = {
  ...offer,
  offerKey: 'endless',
  kind: 'chain',
  state: 'shown',
  tier: 1,
  tierCount: 3,
  current: freeTier,
  next: { ...offer.current, index: 2, type: 'paid' },
  purchasesRemaining: null,
};

describe('OffersClient.claim (free chain tiers)', () => {
  it('a free tier parses with type, a null storeProductKey and no SKUs', async () => {
    const { fetch } = makeFetch([() => jsonRes(200, { data: [chainOffer] })]);
    const kraty = new Kraty(baseOpts(fetch));
    const [o] = await kraty.offers.list();
    expect(o!.current.type).toBe('free');
    expect(o!.current.storeProductKey).toBeNull();
    expect(o!.current.skus).toEqual({});
    expect(o!.next!.type).toBe('paid');
  });

  it('claim POSTs the tapped tier with a generated idempotency key', async () => {
    const result = {
      claim: {
        claimId: 'c-1',
        offerId: 'o-1',
        offerKey: 'endless',
        instanceId: INSTANCE,
        tier: 1,
        contents: freeTier.contents,
        granted: false,
        grantId: null,
        studioFulfils: true,
        claimedAt: '2026-10-15T12:00:00.000Z',
      },
      offer: { ...chainOffer, tier: 2, current: chainOffer.next, next: null },
    };
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: result })]);
    const kraty = new Kraty(baseOpts(fetch));
    const out = await kraty.offers.claim(INSTANCE, { tier: 1 });
    expect(out).toEqual(result);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`https://api.test.kraty.io/sdk/v1/players/alice/offers/${INSTANCE}/claim`);
    expect(calls[0]!.body).toEqual({ tier: 1, idempotencyKey: 'idem-1' });
    expect(calls[0]!.headers['X-Player-Secret'] ?? calls[0]!.headers['x-player-secret']).toBe('sekret');
  });

  it('claim keeps a caller key and honours `as`', async () => {
    const { fetch, calls } = makeFetch([() => jsonRes(200, { data: { claim: {}, offer: chainOffer } })]);
    const kraty = new Kraty(baseOpts(fetch));
    await kraty.offers.claim(INSTANCE, { tier: 0, idempotencyKey: 'mine', as: 'bob' });
    expect(calls[0]!.url).toBe(`https://api.test.kraty.io/sdk/v1/players/bob/offers/${INSTANCE}/claim`);
    expect(calls[0]!.body).toEqual({ tier: 0, idempotencyKey: 'mine' });
  });

  it('a refused claim surfaces as a conflict error with the reason and the current offer', async () => {
    const { fetch } = makeFetch([
      () =>
        jsonRes(409, {
          error: {
            code: 'conflict',
            message: 'the current tier is not the one claimed',
            details: { reason: 'tier_changed', offer: { ...chainOffer, tier: 2 } },
          },
        }),
    ]);
    const kraty = new Kraty(baseOpts(fetch));
    await expect(kraty.offers.claim(INSTANCE, { tier: 1 })).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
      details: { reason: 'tier_changed', offer: { tier: 2 } },
    });
  });
});

describe('canonicalTransactionId', () => {
  it('App Store: the StoreKit 2 transactionId, never originalTransactionId', () => {
    expect(
      canonicalTransactionId({
        store: 'app_store',
        transactionId: '2000000999',
        originalTransactionId: '2000000001',
      }),
    ).toBe('2000000999');
  });

  it('Google Play: the orderId, with purchaseToken only as a fallback', () => {
    expect(
      canonicalTransactionId({ store: 'google_play', orderId: 'GPA.1234-5678', purchaseToken: 'tok' }),
    ).toBe('GPA.1234-5678');
    expect(canonicalTransactionId({ store: 'google_play', purchaseToken: 'tok' })).toBe('tok');
  });

  it('other stores pass their transaction id through', () => {
    expect(canonicalTransactionId({ store: 'steam', transactionId: '77' })).toBe('77');
  });

  it('throws when the store id is missing', () => {
    expect(() => canonicalTransactionId({ store: 'app_store', originalTransactionId: '1' })).toThrow(
      /transactionId/,
    );
    expect(() => canonicalTransactionId({ store: 'google_play' })).toThrow(/orderId/);
  });
});
