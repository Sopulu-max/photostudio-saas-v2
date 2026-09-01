/**
 * What kinds of money a studio moves.
 *
 * Split out of domain.ts because that file is `'use server'` and may only
 * export async functions — the same reason services keeps variableTypes apart.
 *
 * There are three, and the restraint is the point. A studio's books are full
 * of words — "deposit", "balance", "equipment", "rent", "second shooter" — and
 * the temptation is to make each a kind. But those are labels *beneath* a kind,
 * the same way Wedding is a value of Occasion rather than a service of its own.
 * Rent and Equipment are both money the studio spent; nothing downstream ever
 * needs to branch between them, while everything downstream needs to know
 * whether money came in, went back, or went out. So `kind` carries the
 * structure and `type` stays the studio's own free label under it.
 *
 * Direction is derived from kind rather than stored alongside it as a second
 * opinion. An inbound expense is not a thing that can happen, and a model that
 * can express it will eventually contain one.
 */

export const TRANSACTION_KINDS = ['charge', 'refund', 'expense'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export type KindSpec = {
  direction: 'inbound' | 'outbound';
  /** How it reads in a sentence about the studio. */
  label: string;
  /** What it means, for the operator choosing one. */
  hint: string;
  /**
   * Its sign when totalling what the studio has actually earned. A refund
   * given back reduces earnings; a cost of doing business is not a reduction
   * in revenue, it is a separate figure — so expenses net to zero here and
   * are counted on their own.
   */
  earningsSign: 1 | -1 | 0;
  /** Whether it belongs to a client rather than to the studio's own running costs. */
  clientFacing: boolean;
};

export const KINDS: Record<TransactionKind, KindSpec> = {
  charge: {
    direction: 'inbound',
    label: 'Charge',
    hint: 'What a client owes you — a deposit, a balance, an extra.',
    earningsSign: 1,
    clientFacing: true,
  },
  refund: {
    direction: 'outbound',
    label: 'Refund',
    hint: 'Money going back to a client.',
    earningsSign: -1,
    clientFacing: true,
  },
  expense: {
    direction: 'outbound',
    label: 'Cost',
    hint: 'What the studio spent — gear, travel, a freelancer, rent.',
    earningsSign: 0,
    clientFacing: false,
  },
};

export function kindOf(t: { kind?: string | null; direction?: string | null; type?: string | null }): TransactionKind {
  if (t.kind && (TRANSACTION_KINDS as readonly string[]).includes(t.kind)) return t.kind as TransactionKind;
  // Rows written before kind existed, read the way the backfill reads them.
  if (t.direction === 'inbound') return 'charge';
  return /refund/i.test(t.type || '') ? 'refund' : 'expense';
}

/**
 * Where an invoice stands, worked out from the money against it.
 *
 * Deliberately not a stored column. A `paid` flag and a set of payments are
 * two records of one fact, and the moment a payment is voided or refunded they
 * disagree — with the flag usually winning, because it is the one the list
 * page reads. Deriving it costs an addition and can never be wrong.
 */
export function settlementOf(
  total: number,
  payments: { kind?: string | null; amount: any; status?: string | null }[]
): { paid: number; outstanding: number; settled: boolean; partly: boolean } {
  let paid = 0;
  for (const p of payments) {
    if (p.status !== 'settled') continue;
    const spec = KINDS[kindOf(p)];
    // A refund against an invoice gives money back, so it un-pays it.
    if (spec.earningsSign !== 0) paid += Number(p.amount || 0) * spec.earningsSign;
  }
  const outstanding = Math.max(total - paid, 0);
  return {
    paid,
    outstanding,
    // Zero-total invoices aren't "paid" — there was nothing to pay.
    settled: total > 0 && paid >= total,
    partly: paid > 0 && paid < total,
  };
}

/**
 * Money totals, kept apart by currency.
 *
 * Never one number: a studio billing in two currencies has two answers, and
 * adding them produces a third that is true in neither. The page shows a
 * figure per currency rather than a total labelled with whichever currency
 * happened to be the studio's default.
 */
export type MoneyTotals = {
  currency: string;
  /** Settled charges minus settled refunds. What the studio actually earned. */
  earned: number;
  /** Settled expenses. What running the studio cost. */
  spent: number;
  /** Charges raised and not yet settled — what clients still owe. */
  owed: number;
};

export function totalsByCurrency(
  rows: { kind?: string | null; direction?: string | null; type?: string | null; amount: any; currency?: string | null; status?: string | null }[],
  fallbackCurrency = 'USD'
): MoneyTotals[] {
  const by = new Map<string, MoneyTotals>();

  for (const r of rows) {
    // Voided money never happened, so it counts nowhere.
    if (r.status === 'voided') continue;

    const currency = r.currency || fallbackCurrency;
    const spec = KINDS[kindOf(r)];
    const amount = Number(r.amount || 0);
    const t = by.get(currency) || { currency, earned: 0, spent: 0, owed: 0 };

    if (r.status === 'settled') {
      if (spec.earningsSign !== 0) t.earned += amount * spec.earningsSign;
      if (spec.direction === 'outbound' && spec.earningsSign === 0) t.spent += amount;
    } else if (spec.clientFacing && spec.direction === 'inbound') {
      // Only a charge can be outstanding. An unpaid cost is the studio's own
      // problem to schedule, not something a client owes.
      t.owed += amount;
    }

    by.set(currency, t);
  }

  return [...by.values()].sort((a, b) => b.earned - a.earned);
}

/**
 * How an invoice line reads: what was sold, what it was configured as, and what
 * portion of it is being billed.
 *
 * HERE BECAUSE TWO PLACES COMPOSE IT. createInvoiceForBooking writes the real
 * line, and the New Booking form shows the operator what that line will say
 * before the booking is saved. A form that draws its own version of a string the
 * server writes is the same setup that let the package editor store `amount`
 * while everything downstream read `base_price` — they agree until one of them
 * is edited.
 *
 * The two legitimately differ in what they can SEE: the server reads the values
 * recorded against the line, the form knows only what has been typed into it so
 * far. That is a difference of inputs, which is honest. The joining is one
 * function, so it cannot become a difference of format.
 */
export function describeInvoiceLine(input: {
  /** What was sold — the package's name. */
  title: string;
  /** What it was configured as, already formatted. Empties are dropped. */
  details: string[];
  /** What the client sees when this bills part of the work, e.g. "50% deposit". */
  label?: string | null;
}): string {
  const detail = input.details.filter((d) => (d ?? '').trim() !== '').join(' · ');
  const described = detail ? `${input.title} · ${detail}` : input.title;
  return input.label ? `${described} — ${input.label}` : described;
}

/**
 * What a line bills, and what the client sees as its unit price.
 *
 * THE SHARE APPLIES TO THE LINE TOTAL, NOT THE UNIT PRICE, so a part invoice for
 * "3 hours" still reads as three hours rather than as a fractional hour nobody
 * agreed to. That is why the unit price is the amount itself on a part invoice:
 * quantity is what was sold, and restating it as a fraction would misdescribe
 * the work.
 */
export function invoiceLineAmount(input: { unitAmount: number; quantity: number; share: number }) {
  const full = input.unitAmount * input.quantity;
  const amount = Math.round(full * input.share * 100) / 100;
  return {
    amount,
    unitPrice: input.share === 1 ? input.unitAmount : amount,
  };
}

/** A percentage as a multiplier. Omitted means all of it. */
export function billingShare(percentage?: number | null): number {
  return percentage == null ? 1 : Math.max(0, Math.min(100, Number(percentage))) / 100;
}

/** Tax on a net figure, at the rate the document was raised under. */
export function taxOn(net: number, taxRate: number): number {
  if (!taxRate || taxRate <= 0) return 0;
  return Math.round(net * (taxRate / 100) * 100) / 100;
}

export type DiscountKind = 'percentage' | 'amount';

/**
 * WHAT COMES OFF, AND IN WHAT ORDER.
 *
 * A studio gives ground two ways — a share of the work, or a flat sum — and the
 * two are not interchangeable: ten per cent of a booking that grows is a
 * different concession from twenty thousand naira off it. Both are recorded as
 * said, and this turns either into money.
 *
 * IT NEVER EXCEEDS WHAT IS BEING CHARGED. A discount larger than the subtotal
 * would make an invoice for a negative amount, which is not a discount but a
 * refund, and a refund is a payment travelling the other way with its own row.
 *
 * BEFORE TAX, always. Tax is owed on what the client is actually asked for, so
 * discounting after it would bill tax on money nobody was charged. The order is
 * subtotal, less discount, then tax on what is left — which is why taxOn is
 * given the net and not the subtotal.
 */
export function discountOn(subtotal: number, kind?: DiscountKind | null, value?: number | null): number {
  if (!kind || value == null) return 0;
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const off = kind === 'percentage'
    ? subtotal * (Math.min(v, 100) / 100)
    : v;
  return Math.round(Math.max(0, Math.min(off, subtotal)) * 100) / 100;
}

/**
 * The whole descent from what was sold to what is owed, in one place.
 *
 * Every surface that shows money on an invoice — the booking form's preview,
 * the document, the client's copy — was working the same sum out for itself.
 * That is how the package editor came to store `amount` while everything
 * downstream read `base_price`: two versions of one calculation agree until one
 * of them is edited.
 */
export function invoiceTotals(input: {
  subtotal: number;
  discountKind?: DiscountKind | null;
  discountValue?: number | null;
  /** Frozen on a document already raised; recomputed while one is being built. */
  discountAmount?: number | null;
  taxRate: number;
}) {
  const subtotal = Math.round(input.subtotal * 100) / 100;
  const discount = input.discountAmount != null
    ? Math.round(Math.max(0, Math.min(Number(input.discountAmount), subtotal)) * 100) / 100
    : discountOn(subtotal, input.discountKind, input.discountValue);
  const net = Math.round((subtotal - discount) * 100) / 100;
  const tax = taxOn(net, input.taxRate);
  return { subtotal, discount, net, tax, total: Math.round((net + tax) * 100) / 100 };
}
