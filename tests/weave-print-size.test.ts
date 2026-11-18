import { describe, it, expect } from 'vitest';
import { sizeOf, saySize, type Product, type ProductVariant } from '@/weave/store/shape';

/**
 * What is actually being made, and how it is said.
 *
 * The rule under test is that a size is STATED, never inferred: an option
 * named "12 × 18" with no measurements has no size, however much the label
 * looks like one.
 */
const product = (over: Partial<Product> = {}): Product => ({
  id: 'p', name: '8 x 10 print', kind: 'physical', price: 500_000, currency: 'NGN',
  position: 0, shownAs: 'print', size: { widthMm: 203, heightMm: 254 }, variants: [], ...over,
});

const variant = (over: Partial<ProductVariant> = {}): ProductVariant => ({
  id: 'v', name: 'Lustre', priceDelta: 0, position: 0, size: null, ...over,
});

describe('the size being bought', () => {
  it('is the product\'s when the option does not restate it', () => {
    expect(sizeOf(product(), variant())).toEqual({ widthMm: 203, heightMm: 254 });
  });

  it('is the option\'s when it does, because that is the thing being made', () => {
    const bigger = variant({ name: '12 × 18', size: { widthMm: 305, heightMm: 457 } });
    expect(sizeOf(product(), bigger)).toEqual({ widthMm: 305, heightMm: 457 });
  });

  /*
   * The anti-parsing assertion. A label that reads like a size is still only
   * a label — the studio's own word, which the engine never interprets.
   */
  it('is nothing when a size-looking name was never measured', () => {
    const looksLikeOne = variant({ name: '12 × 18', size: null });
    expect(sizeOf(product({ size: null }), looksLikeOne)).toBeNull();
  });

  it('is nothing for something with no size at all, like a file', () => {
    expect(sizeOf(product({ kind: 'digital', size: null }))).toBeNull();
  });
});

describe('how a size is said to a client', () => {
  it('gives both units, so nobody has to convert to picture it', () => {
    expect(saySize({ widthMm: 203, heightMm: 254 })).toBe('8 × 10 in · 203 × 254 mm');
  });

  it('keeps a fraction rather than rounding a size away', () => {
    expect(saySize({ widthMm: 311, heightMm: 457 })).toBe('12.2 × 18 in · 311 × 457 mm');
  });
});
