/**
 * The store: what is for sale, and what was bought.
 *
 * Money is in MINOR UNITS throughout - kobo, cents - and never a float.
 * 0.1 + 0.2 is not 0.3, and a studio's takings are not the place to find that
 * out.
 */

export type ProductKind = 'digital' | 'physical';

export type Product = {
  id: string;
  name: string;
  kind: ProductKind;
  price: number;
  currency: string;
  position: number;
};

export type PriceList = {
  id: string;
  name: string;
  isDefault: boolean;
  products: Product[];
};

export type BasketLine = { productId: string; fileId: string | null; quantity: number };

export type OrderLine = {
  id: string;
  name: string;
  kind: ProductKind;
  unitPrice: number;
  quantity: number;
  fileId: string | null;
  fileName: string | null;
};

export type Order = {
  id: string;
  galleryId: string | null;
  jobId: string | null;
  who: string | null;
  shipTo: string | null;
  note: string | null;
  currency: string;
  placedAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  lines: OrderLine[];
};

export function orderTotal(lines: { unitPrice: number; quantity: number }[]): number {
  return lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
}

/** Money as the studio writes it, from minor units. */
export function money(minor: number, currency: string): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency', currency, maximumFractionDigits: major % 1 === 0 ? 0 : 2,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

/**
 * Where an order stands, derived from three timestamps rather than stored.
 *
 * `unpaid` is the one that earns its place - it is the only state that is
 * somebody's to act on, and it is the studio's, not the client's.
 */
export type Standing = 'unpaid' | 'to make' | 'done';

export function standingOf(o: { paidAt: string | null; fulfilledAt: string | null }): Standing {
  if (o.fulfilledAt) return 'done';
  return o.paidAt ? 'to make' : 'unpaid';
}

/** An order, as a sentence. */
export function sayOrder(o: Order): string {
  const total = money(orderTotal(o.lines), o.currency);
  const items = o.lines.reduce((n, l) => n + l.quantity, 0);
  const many = `${items} ${items === 1 ? 'thing' : 'things'}`;
  const standing = standingOf(o);
  if (standing === 'done') return `${many}, ${total}, sent`;
  if (standing === 'to make') return `${many}, ${total}, paid and waiting to be made`;
  return `${many}, ${total}, not paid yet`;
}
