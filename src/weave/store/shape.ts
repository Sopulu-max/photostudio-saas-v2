/**
 * The store: what is for sale, and what was bought.
 *
 * Money is in MINOR UNITS throughout - kobo, cents - and never a float.
 * 0.1 + 0.2 is not 0.3, and a studio's takings are not the place to find that
 * out.
 */

export type ProductKind = 'digital' | 'physical';

/**
 * A photograph of a real room, with somewhere to hang a print in it.
 *
 * `hangs` null means a detail shot — an edge, a float mount, a corner — shown
 * as it is. The absence of a measurement already says what it is, so there is
 * no kind column restating it.
 */
export type RoomScene = {
  id: string;
  name: string;
  url: string | null;
  position: number;
  hangs: {
    /** How wide the photograph is in real life, so sizes are true. */
    wallMm: number;
    /** Middle of the print, as fractions of the image. */
    x: number;
    y: number;
  } | null;
};

/** How the engine draws it. Three distinct renderings, which is what earns a kind. */
export type ShownAs = 'print' | 'framed' | 'canvas';

/** Millimetres, stated by the studio. Never parsed out of a name. */
export type Size = { widthMm: number; heightMm: number };

export type ProductVariant = {
  id: string;
  name: string;
  priceDelta: number;
  position: number;
  /** An option may restate the size — "12 × 18" is a size, "Lustre" is not. */
  size: Size | null;
};

export type Product = {
  id: string;
  name: string;
  kind: ProductKind;
  price: number;
  currency: string;
  position: number;
  shownAs: ShownAs;
  size: Size | null;
  variants: ProductVariant[];
};

/**
 * The size actually being bought.
 *
 * An option that states its own measurements is the thing being made, so it
 * wins. One that does not — a finish, a paper — leaves the product's size
 * standing.
 */
export function sizeOf(product: Product, variant?: ProductVariant | null): Size | null {
  return variant?.size ?? product.size ?? null;
}

/**
 * What a client is shown about the size, in their own units.
 *
 * Both, because a studio in Lagos quotes inches and a lab quotes millimetres,
 * and a client should never have to convert to know whether it fits a wall.
 */
export function saySize(size: Size): string {
  const inches = (mm: number) => {
    const n = mm / 25.4;
    return Number.isInteger(Math.round(n * 10) / 10) ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1);
  };
  return `${inches(size.widthMm)} × ${inches(size.heightMm)} in · ${size.widthMm} × ${size.heightMm} mm`;
}

export type PriceList = {
  id: string;
  name: string;
  isDefault: boolean;
  products: Product[];
};

export type BasketLine = {
  productId: string; variantId: string | null; fileId: string | null; quantity: number;
};

export type OrderLine = {
  id: string;
  name: string;
  kind: ProductKind;
  unitPrice: number;
  quantity: number;
  fileId: string | null;
  fileName: string | null;
  variantName: string | null;
};

export type Order = {
  id: string;
  galleryId: string | null;
  bookingId: string | null;
  who: string | null;
  shipTo: string | null;
  discountCode: string | null;
  discountOff: number;
  note: string | null;
  currency: string;
  placedAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  lines: OrderLine[];
};

/** What is actually owed: the lines, less whatever a code took off. */
export function orderOwed(o: {
  lines: { unitPrice: number; quantity: number }[]; discountOff: number;
}): number {
  return Math.max(0, orderTotal(o.lines) - (o.discountOff ?? 0));
}

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
  const total = money(orderOwed(o), o.currency);
  const items = o.lines.reduce((n, l) => n + l.quantity, 0);
  const many = `${items} ${items === 1 ? 'thing' : 'things'}`;
  const standing = standingOf(o);
  if (standing === 'done') return `${many}, ${total}, sent`;
  if (standing === 'to make') return `${many}, ${total}, paid and waiting to be made`;
  return `${many}, ${total}, not paid yet`;
}
