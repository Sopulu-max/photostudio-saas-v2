import { describe, it, expect, vi, afterEach } from 'vitest';
import { priceOf, amountOf, toStored, firstPriced, hasPrice } from '@/kernel/money';

/**
 * Money, and the difference between nothing and unreadable.
 *
 * The old reader was `Number((x as any)?.base_price || 0)`, repeated in six
 * places across three modules. It turned every shape it did not recognise into
 * zero — a free shoot, with no error anywhere. These tests exist to pin the one
 * behaviour that fixes: unpriced still totals as nothing, but MALFORMED is now
 * said out loud instead of quietly becoming free.
 *
 * No database. This is arithmetic and parsing, and a test that reaches for the
 * network to check arithmetic is testing the network.
 */

afterEach(() => vi.restoreAllMocks());

describe('Money', () => {
  it('reads a stored price', () => {
    expect(priceOf({ base_price: 20000, currency: 'NGN' })).toEqual({ amount: 20000, currency: 'NGN' });
  });

  it('treats an unpriced row as unpriced, not as free', () => {
    // Two of three real packages are in exactly this state, and it is normal.
    expect(priceOf({})).toBeNull();
    expect(priceOf(null)).toBeNull();
    expect(priceOf({ base_price: null })).toBeNull();
    // Summing it still contributes nothing, which is what a total of "no price
    // yet" should be — the behaviour callers depend on is unchanged.
    expect(amountOf({})).toBe(0);
  });

  it('says so when a price is present but unreadable', () => {
    const complained = vi.spyOn(console, 'error').mockImplementation(() => {});

    // The old reader answered 0 for every one of these, silently.
    expect(priceOf({ base_price: 'twenty thousand' })).toBeNull();
    expect(priceOf('20000')).toBeNull();
    expect(priceOf([20000])).toBeNull();

    expect(complained, 'a malformed price passed without complaint').toHaveBeenCalledTimes(3);
  });

  it('does not complain about a row that is merely unpriced', () => {
    const complained = vi.spyOn(console, 'error').mockImplementation(() => {});
    priceOf({});
    priceOf(null);
    expect(complained, 'an unpriced row was reported as an error').not.toHaveBeenCalled();
  });

  it('keeps zero distinct from absent', () => {
    // Free is a price a studio can legitimately set; unpriced is not a price.
    expect(priceOf({ base_price: 0, currency: 'NGN' })).toEqual({ amount: 0, currency: 'NGN' });
    expect(priceOf({})).toBeNull();
  });

  it('falls back to the studio currency only when the row carries none', () => {
    expect(priceOf({ base_price: 100 }, 'NGN')?.currency).toBe('NGN');
    expect(priceOf({ base_price: 100, currency: 'USD' }, 'NGN')?.currency).toBe('USD');
  });

  it('round-trips through the stored shape', () => {
    const money = { amount: 20000, currency: 'NGN' };
    expect(priceOf(toStored(money))).toEqual(money);
  });

  it('reads the shape the package editor used to write', () => {
    /*
     * The only screen for pricing a package wrote { amount } and read { amount }
     * back, so it agreed with itself: an operator typed 10,000, saw 10,000, and
     * had no way to know that every invoice, contract and booking total read
     * base_price, found nothing, and priced the package at zero.
     *
     * The editor now writes base_price. This reads both so no existing row is
     * stranded, and this test is what stops the two drifting apart again.
     */
    expect(priceOf({ amount: 10000, currency: 'NGN' })).toEqual({ amount: 10000, currency: 'NGN' });
    // Canonical wins when a row somehow carries both.
    expect(priceOf({ base_price: 20000, amount: 999, currency: 'NGN' })?.amount).toBe(20000);
  });
});

describe('Choosing between two places a price might live', () => {
  it('does not let an empty price beat a real one', () => {
    /*
     * The bug this exists for: packages.price is NOT NULL DEFAULT '{}', and {}
     * is truthy, so `packagePrice || linePrice` picked the empty object and
     * threw away the number beside it. It silently zeroed a real 120,000 line
     * and a 34,000 one.
     */
    const emptyPackagePrice = {};
    const realLinePrice = { base_price: 120000, currency: 'NGN' };
    expect(amountOf(firstPriced(emptyPackagePrice, realLinePrice))).toBe(120000);
  });

  it('prefers the first that is actually priced', () => {
    expect(amountOf(firstPriced({ base_price: 5000 }, { base_price: 9000 }))).toBe(5000);
    expect(amountOf(firstPriced(null, undefined, {}, { base_price: 700 }))).toBe(700);
  });

  it('answers unpriced when nothing carries a price', () => {
    expect(hasPrice(firstPriced({}, null))).toBe(false);
    expect(amountOf(firstPriced({}, null))).toBe(0);
  });

  it('treats a free line as priced, not as absent', () => {
    // Zero is a decision; {} is the absence of one. They must not collapse.
    expect(amountOf(firstPriced({ base_price: 0 }, { base_price: 9000 }))).toBe(0);
  });
});
