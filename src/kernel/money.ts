/**
 * An amount of money, as one shape.
 *
 * WHAT WAS WRONG. A price was untyped `jsonb` and four modules read it the same
 * way, independently:
 *
 *     Number((line.price as any)?.base_price || 0)
 *
 * Bookings did it in four places, Contracts once, Finances once. Every one of
 * them asserted a shape TypeScript could not check, and every one of them
 * turned anything it did not recognise into **zero** — a free shoot, silently,
 * with no error anywhere. That is not hypothetical: a lens total came out as
 * ₦0 for exactly this reason, and a storefront price rendered at 1/100th for a
 * cousin of it. A system whose stated job is to mirror economic reality had no
 * type for money.
 *
 * WHY THE SHAPE IS WHAT IT IS. The stored form is `{ base_price, currency }`
 * inside a JSON column, and that is what every existing row holds. Reading it
 * is therefore a parse, not a cast — the difference being that a parse can
 * fail, and failing is the whole point.
 *
 * ZERO AND ABSENT ARE DIFFERENT. `{}` means nobody has priced this yet; two of
 * three packages are in exactly that state. Zero means it is free. Collapsing
 * them is what `|| 0` did. `priceOf` answers null for the first and a Money for
 * the second, and `amountOf` exists for the many callers that legitimately want
 * "nothing priced totals as nothing" — but it says so out loud when the value
 * was malformed rather than merely absent.
 */

export type Money = {
  /** In major units, as the studio types them. 20000 is ₦20,000. */
  amount: number;
  /** ISO code. Falls back to the studio's own when a row predates carrying one. */
  currency: string | null;
};

/** The stored form, as it exists in `packages.pricing` and `booking_lines.price`. */
type StoredPrice = {
  base_price?: unknown;
  currency?: unknown;
  [key: string]: unknown;
};

const isObject = (v: unknown): v is StoredPrice =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The price a row carries, or null when it carries none.
 *
 * Null is a real answer — an unpriced package is a normal state, not an error.
 * A value that is present but unreadable is a different thing and is logged,
 * because that one means the data and this parser disagree.
 */
export function priceOf(raw: unknown, fallbackCurrency?: string | null): Money | null {
  if (raw == null) return null;

  if (!isObject(raw)) {
    console.error('A price was stored in a shape this cannot read:', raw);
    return null;
  }

  const { base_price: base } = raw;
  // An empty object is the ordinary "not priced yet", and says nothing wrong.
  if (base === undefined || base === null || base === '') return null;

  const amount = typeof base === 'number' ? base : Number(base);
  if (!Number.isFinite(amount)) {
    console.error('A price was stored with an amount that is not a number:', base);
    return null;
  }

  const currency = typeof raw.currency === 'string' && raw.currency
    ? raw.currency
    : (fallbackCurrency ?? null);

  return { amount, currency };
}

/**
 * What a row is worth, for adding up.
 *
 * Unpriced totals as nothing, which is what a sum of "no price yet" should be.
 * The difference from the old `|| 0` is that unreadable no longer looks like
 * unpriced — `priceOf` has already said so on the way past.
 */
export function amountOf(raw: unknown): number {
  return priceOf(raw)?.amount ?? 0;
}

/** The stored form, from a Money. The only place that shape is written. */
export function toStored(price: Money): StoredPrice {
  return { base_price: price.amount, currency: price.currency };
}
