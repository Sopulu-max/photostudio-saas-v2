import { describe, it, expect } from 'vitest';
import { discountOn, invoiceTotals, billingShare, invoiceLineAmount } from '@/modules/finances/money';

/**
 * What comes off a price, and in what order.
 *
 * Pure arithmetic, so it runs without a database — and it is exactly the part
 * that fails silently. A discount applied after tax, or a percentage taken of
 * the wrong figure, produces an invoice that looks entirely reasonable and is
 * wrong by a few per cent forever.
 */
describe('what comes off a price', () => {
  it('takes a percentage of what is being charged', () => {
    expect(discountOn(200_000, 'percentage', 10)).toBe(20_000);
  });

  it('takes a flat sum as the sum itself, whatever the total', () => {
    expect(discountOn(200_000, 'amount', 20_000)).toBe(20_000);
    expect(discountOn(50_000, 'amount', 20_000)).toBe(20_000);
  });

  it('never gives back more than is being charged', () => {
    // A discount larger than the work is not a discount. It would make an
    // invoice for a negative amount, which is a refund — a payment travelling
    // the other way, with its own row.
    expect(discountOn(50_000, 'amount', 90_000)).toBe(50_000);
    expect(discountOn(50_000, 'percentage', 140)).toBe(50_000);
  });

  it('is nothing when nothing was given', () => {
    expect(discountOn(200_000, null, null)).toBe(0);
    expect(discountOn(200_000, 'percentage', 0)).toBe(0);
    expect(discountOn(200_000, 'amount', -5)).toBe(0);
  });
});

describe('the descent from what was sold to what is owed', () => {
  it('taxes what is left after the discount, not what was charged before it', () => {
    // 200,000 less 10% is 180,000; 7.5% of THAT is 13,500.
    // Taxing the subtotal instead would bill 15,000 — tax on 20,000 nobody
    // was asked for, and an overcharge that reconciles against nothing.
    const t = invoiceTotals({ subtotal: 200_000, discountKind: 'percentage', discountValue: 10, taxRate: 7.5 });
    expect(t.discount).toBe(20_000);
    expect(t.net).toBe(180_000);
    expect(t.tax).toBe(13_500);
    expect(t.total).toBe(193_500);
  });

  it('is the plain sum when a studio charges no tax and gives nothing away', () => {
    const t = invoiceTotals({ subtotal: 210_000, taxRate: 0 });
    expect(t).toMatchObject({ subtotal: 210_000, discount: 0, net: 210_000, tax: 0, total: 210_000 });
  });

  it('prefers the frozen amount over recomputing it', () => {
    // A document already raised keeps what it said. The lines can move
    // underneath it — this is the whole reason the amount is stored beside the
    // rate rather than derived from it, exactly as tax is.
    const t = invoiceTotals({
      subtotal: 100_000, discountKind: 'percentage', discountValue: 10,
      discountAmount: 20_000, taxRate: 0,
    });
    expect(t.discount, 'recomputed instead of reading what was frozen').toBe(20_000);
    expect(t.net).toBe(80_000);
  });

  it('never lets a frozen amount exceed the lines it came off', () => {
    const t = invoiceTotals({ subtotal: 30_000, discountAmount: 90_000, taxRate: 0 });
    expect(t.discount).toBe(30_000);
    expect(t.total).toBe(0);
  });
});

describe('a deposit is a share of what is actually owed', () => {
  it('bills half of the discounted work, not half of the list price', () => {
    // 200,000 less 10% is 180,000. Half of that is 90,000.
    // Halving first and discounting after reaches the same number here and a
    // different one the moment either figure changes — order is not an
    // accident that happens to work.
    const subtotal = 200_000;
    const { discount, net } = invoiceTotals({ subtotal, discountKind: 'percentage', discountValue: 10, taxRate: 0 });
    expect(discount).toBe(20_000);

    const share = billingShare(50);
    const { amount } = invoiceLineAmount({ unitAmount: net, quantity: 1, share });
    expect(amount).toBe(90_000);
  });

  it('bills half a FLAT concession on a half invoice, not all of it', () => {
    // The case that separates the two orderings. A 20,000 discount on a
    // 200,000 job, invoiced as a 50% deposit:
    //   share first  → 100,000 less 20,000 = 80,000, and the balance takes the
    //                  whole 20,000 again — the concession given away twice.
    //   discount first, then shared → 10,000 off each half. 180,000 in total,
    //                  which is what was agreed.
    const share = billingShare(50);
    const fullDiscount = discountOn(200_000, 'amount', 20_000);
    const sharedDiscount = Math.round(fullDiscount * share * 100) / 100;
    expect(sharedDiscount).toBe(10_000);

    const { amount: sharedSubtotal } = invoiceLineAmount({ unitAmount: 200_000, quantity: 1, share });
    const deposit = invoiceTotals({ subtotal: sharedSubtotal, discountAmount: sharedDiscount, taxRate: 0 });
    expect(deposit.total).toBe(90_000);

    // And the balance, billed the same way, completes the agreed figure.
    const balance = invoiceTotals({ subtotal: sharedSubtotal, discountAmount: sharedDiscount, taxRate: 0 });
    expect(deposit.total + balance.total, 'the discount was given away twice').toBe(180_000);
  });

  it('leaves the whole of it when no share is named', () => {
    expect(billingShare(null)).toBe(1);
    expect(billingShare(undefined)).toBe(1);
  });
});
