import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { amountOf, firstPriced, hasPrice, extrasAmount } from '@/kernel/money';
import { getStudioCurrency } from '@/kernel/organizations';
import { lineNameOf } from './lineName';
import {
  getBooking, listStages, getIntakeAnswersForBooking, getEnquiryForBooking, suggestedDurationForBooking,
  getLineConfigurationForm, readRequestCoverage,
} from './domain';

/**
 * THE BOOKING PAGE, AS STRUCTURED DATA.
 *
 * The page used to make twenty-two reads and then derive the rest in its
 * JSX: which figure is "Agreed" and which "Booked", which contract is the
 * live one, what a line's classification tags are, which answers to show,
 * whether it can be invoiced or a contract drafted, the totals. Every one
 * of those is a fact about the booking, and a page that works them out for
 * itself is a second reading that can drift from the first - which is how
 * two pages came to print a line's stale title while every paper printed
 * its name.
 *
 * So the page receives this: one read, composed here in Bookings (the
 * booking is the composition root - it asks Production, Finances, Delivery
 * and Notes through their interfaces and never their tables), typed, with
 * every derivation done. What is left for the page is to draw it. Money is
 * given as amounts with a currency; formatting is the page's.
 */

export type Money = { amount: number; currency: string };

export type BookingPageLine = {
  id: string;
  packageId: string | null;
  name: string;
  /** What it sells for on this booking: the instance's price, else the line's. */
  price: { base: number | null; currency: string; unit: string | null; quantity: number } ;
  total: number;
  services: string[];
  /** What the package is classified as - each question, the values it allows. */
  classification: { id: string; name: string; values: { id: string; name: string }[] }[];
  /**
   * What this booking settled about the line: its answer where the package
   * left a classification open, then each variable held or still asked.
   * A value of null is a question the package asks that nobody answered.
   */
  configuration: { key: string; label: string; value: unknown; kind: string | null; unit: string | null }[];
  /** What the package promises, said. */
  promises: string[];
  /** For taking more of what it promises, and what was taken. */
  extras: {
    promises: { packageServiceId: string; deliverableId: string; name: string; quantity: number | null; serviceName: string; rate: number | null }[];
    taken: { id: string; label: string; units: number; unit_rate: unknown; billedOn: { id: string; number: string | null; status: string }[] }[];
  } | null;
};

export type BookingPageData = {
  id: string;
  head: {
    title: string;
    /** The packages on it, as a stamp. */
    stamp: string | null;
    stage: { id: string; name: string; kind: string; color: string | null } | null;
    stages: any[];
    /** Every task done and the booking still booked: the completed stage is available. */
    workDone: boolean;
    client: { id: string; name: string; email: string | null } | null;
    when: { at: string | null; durationMinutes: number | null; suggestedMinutes: number | null };
    brief: string | null;
    owed: Money | null;
  };
  formAnswers: any[];
  lines: BookingPageLine[];
  total: Money | null;
  /** The client's request, and whether what is on the booking answers it. */
  request: { enquiry: any | null; covered: boolean };
  deliverables: {
    fulfilment: any[];
    promised: { id: string; name: string }[];
    undelivered: number;
    deliveries: any[];
  };
  work: { positions: any; tasks: any[]; team: any };
  money: {
    currency: string;
    invoices: any[];
    /** The figures, or null when there is nothing to figure. */
    figures: {
      /** "Agreed" when a signed contract fixes it, "Booked" when the booking's own sum is the value. */
      valueLabel: 'Agreed' | 'Booked';
      value: number;
      invoiced: number;
      discounted: number;
      paid: number;
      leftToInvoice: number;
      leftToPay: number;
      pending: number;
    } | null;
    transactions: any[];
    /** A booking is billable once something on it has a price. */
    canBill: boolean;
    /** What still needs the studio to invoice, for the summary line. */
    leftToInvoice: number;
    booked: number;
  };
  contract: {
    contracts: any[];
    hasOpen: boolean;
    /** Why a contract cannot be drafted yet, or null when it can. */
    blocker: string | null;
  };
  confirmation: { shareToken: string | null; sharedAt: string | null; hasClient: boolean };
  notes: any[];
  /** For the page's controls: who can be put on the work, in which roles. */
  options: { employees: any[]; roles: { id: string; name: string }[] };
};

const priceOfLine = (l: any) => firstPriced(l.package?.price, l.price) as any;
const lineTotal = (l: any) => amountOf(priceOfLine(l)) * Number(l.quantity ?? 1) + extrasAmount(l.extras);

export async function readBookingPage(bookingId: string): Promise<BookingPageData | null> {
  await getAuthOrgId();
  const booking: any = await getBooking(bookingId);
  if (!booking) return null;

  const { getPackage, formatDeliverable } = await import('@/modules/packages/interface');
  const { listDeliveriesForBooking, getFulfilmentForBooking } = await import('@/modules/delivery/interface');
  const { getBookingTeam, getBookingTasks, getBookingWork } = await import('@/modules/production/interface');
  const { listInvoicesForBooking, getBookingBilling } = await import('@/modules/finances/interface');
  const { listNotesAbout } = await import('@/modules/notes/interface');
  const { listEmployees, listRoles } = await import('@/modules/team/interface');

  const lines: any[] = booking.lines || [];
  const packageIds = [...new Set(lines.map((l) => l.package_id as string | null).filter(Boolean))] as string[];

  const [
    packages, configs, deliveries, stages, formAnswers, enquiry, coverage, suggestedMinutes, studioCurrency,
    fulfilment, team, tasks, employees, roles, positions, invoices, billing, notes,
  ] = await Promise.all([
    Promise.all(packageIds.map(async (id) => [id, await getPackage(id).catch(() => null)] as const)),
    Promise.all(lines.map(async (l) => [l.id as string, await getLineConfigurationForm(l.id)] as const)),
    listDeliveriesForBooking(bookingId),
    listStages(),
    getIntakeAnswersForBooking(bookingId),
    getEnquiryForBooking(bookingId),
    readRequestCoverage(bookingId),
    suggestedDurationForBooking(bookingId),
    getStudioCurrency(),
    getFulfilmentForBooking(bookingId),
    getBookingTeam(bookingId),
    getBookingTasks(bookingId),
    listEmployees(),
    listRoles(),
    getBookingWork(bookingId),
    listInvoicesForBooking(bookingId),
    getBookingBilling(bookingId),
    listNotesAbout({ type: 'booking', id: bookingId }),
  ]);
  const packageById = new Map<string, any>(packages.filter(([, p]) => p) as [string, any][]);
  const configByLine = new Map<string, any[]>(configs);

  // ---- The lines, each as what it is on this booking.
  const pageLines: BookingPageLine[] = lines.map((l) => {
    const pkg = l.package_id ? packageById.get(l.package_id) : null;
    const price = priceOfLine(l);

    // The package's classification: each question once, the values it allows
    // across the package's own narrowing and its services'.
    type Tag = { id: string; name: string; values: { id: string; name: string }[] };
    const byDimension = new Map<string, Tag>();
    const absorb = (dims: any[]) => {
      for (const d of (dims || [])) {
        const target: Tag = byDimension.get(d.id) ?? { id: d.id, name: d.name, values: [] };
        for (const v of d.values || []) if (!target.values.some((x) => x.id === v.id)) target.values.push({ id: v.id, name: v.name });
        byDimension.set(d.id, target);
      }
    };
    if (pkg) { absorb(pkg.dimensions); (pkg.services || []).forEach((s: any) => absorb(s.dimensions)); }

    // The booking's answer where the package left a classification open - a
    // question with more than one value allowed, answered on the booking.
    const openAnswers = coverage.answers
      .filter((a) => { const d = byDimension.get(a.dimensionId); return d && d.values.length > 1 && d.values.some((v) => v.id === a.valueId); })
      .map((a) => ({ key: `dim:${a.dimensionId}`, label: a.dimensionName, value: a.valueName, kind: null, unit: null }));
    const held = (configByLine.get(l.id) || [])
      .filter((f: any) => f.value != null || f.asked)
      .map((f: any) => ({ key: `var:${f.serviceVariableId}`, label: f.label as string, value: f.value, kind: (f.kind ?? null) as string | null, unit: (f.unit ?? null) as string | null }));

    return {
      id: l.id,
      packageId: l.package_id ?? null,
      name: lineNameOf(l),
      price: { base: price?.base_price ?? null, currency: price?.currency || studioCurrency, unit: price?.unit ?? null, quantity: Number(l.quantity ?? 1) },
      total: lineTotal(l),
      services: ((pkg?.services || []) as any[]).map((s) => s.name).filter(Boolean),
      classification: [...byDimension.values()],
      configuration: [...openAnswers, ...held],
      promises: ((pkg?.deliverables || []) as any[]).map((d) => formatDeliverable(d)),
      extras: pkg ? {
        promises: ((pkg.services || []) as any[]).flatMap((s: any) =>
          ((s.deliverables || []) as any[]).map((d: any) => ({
            packageServiceId: s.packageServiceId as string,
            deliverableId: d.id as string,
            name: d.name as string,
            quantity: (d.quantity ?? null) as number | null,
            serviceName: s.name as string,
            rate: amountOf(((s.offers || []) as any[]).find((o: any) => o.id === d.id)?.rate) || null,
          }))),
        taken: ((l.extras || []) as any[]).map((x: any) => ({
          id: x.id, label: x.label, units: Number(x.units), unit_rate: x.unit_rate,
          billedOn: ((x.billed || []) as any[]).map((b: any) => b.invoice).filter((i: any) => i && !i.voided_at)
            .map((i: any) => ({ id: i.id as string, number: (i.number ?? null) as string | null, status: i.status as string })),
        })),
      } : null,
    };
  });

  // ---- Money. Agreed means signed; otherwise the booking's own sum is the value.
  const contracts: any[] = booking.contracts || [];
  const txns: any[] = booking.transactions || [];
  const byNewest = [...contracts].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const hasOpenContract = contracts.some((c) => !['completed', 'cancelled'].includes(c.status));
  const latestContract = byNewest.find((c) => !['completed', 'cancelled'].includes(c.status)) || byNewest[0];
  const terms: any = latestContract?.terms || {};
  const contractSigned = ['active', 'completed'].includes(latestContract?.status);
  const agreed = contractSigned ? Number(terms.base_price || 0) : 0;
  const booked = pageLines.reduce((s, l) => s + l.total, 0);
  const currency = terms.currency || pageLines.map((l) => l.price).find((p) => p.base != null)?.currency || studioCurrency;
  const pending = txns.filter((t) => t.status === 'pending').reduce((s, t) => s + Number(t.amount || 0), 0);
  const value = agreed > 0 ? agreed : booked;
  // A concession is not a remainder, on either branch.
  const leftToInvoice = agreed > 0 ? Math.max(agreed - billing.invoiced - billing.discounted, 0) : billing.leftToInvoice;

  const canBill = lines.some((l) => hasPrice(priceOfLine(l)));
  const blocker = !booking.contact?.id
    ? 'Add a client to this booking and a contract can be drafted from it.'
    : lines.length === 0
      ? 'Add a package and a contract can be drafted from what was agreed.'
      : !lines.every((l) => hasPrice(priceOfLine(l)))
        ? 'Price every package on this booking and a contract can be drafted from it.'
        : null;

  const stamp = pageLines.map((l) => l.name).filter(Boolean);

  return {
    id: booking.id,
    head: {
      title: booking.title,
      stamp: stamp.length > 0 ? stamp.join(' + ') : null,
      stage: booking.stage ? { id: booking.stage_id, name: booking.stage.name, kind: booking.stage.kind, color: booking.stage.color ?? null } : null,
      stages,
      workDone: positions.allDone && booking.stage?.kind === 'booked',
      client: booking.contact ? { id: booking.contact.id, name: booking.contact.display_name, email: booking.contact.email ?? null } : null,
      when: { at: booking.scheduled_for ?? null, durationMinutes: booking.duration_minutes ?? null, suggestedMinutes },
      brief: booking.brief ?? null,
      owed: pending > 0 ? { amount: pending, currency } : null,
    },
    formAnswers,
    lines: pageLines,
    total: pageLines.length > 0 ? { amount: booked, currency } : null,
    request: { enquiry, covered: coverage.covered },
    deliverables: {
      fulfilment,
      promised: fulfilment.map((f: any) => ({ id: f.id, name: f.name })),
      undelivered: fulfilment.filter((f: any) => !f.shared).length,
      deliveries,
    },
    work: { positions, tasks, team },
    money: {
      currency,
      invoices,
      figures: value > 0 ? {
        valueLabel: agreed > 0 ? 'Agreed' : 'Booked',
        value, invoiced: billing.invoiced, discounted: billing.discounted, paid: billing.paid,
        leftToInvoice, leftToPay: billing.leftToPay, pending,
      } : null,
      transactions: txns,
      canBill,
      leftToInvoice,
      booked: billing.booked,
    },
    contract: { contracts, hasOpen: hasOpenContract, blocker },
    confirmation: { shareToken: booking.share_token ?? null, sharedAt: booking.shared_at ?? null, hasClient: Boolean(booking.contact?.id) },
    notes,
    options: { employees, roles: (roles as any[]).map((r) => ({ id: r.id, name: r.name })) },
  };
}
