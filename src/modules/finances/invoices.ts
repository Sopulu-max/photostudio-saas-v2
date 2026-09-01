'use server';

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertOurs } from '@/kernel/tenancy';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudioCurrency } from '@/kernel/organizations';
import { logEvent } from '@/kernel/events';
import { amountOf, firstPriced, hasPrice } from '@/kernel/money';
import { revalidatePath } from 'next/cache';
import { settlementOf, describeInvoiceLine, invoiceLineAmount, billingShare, taxOn , invoiceTotals, discountOn } from './money';

/**
 * Invoices — the document between what was booked and what was paid.
 *
 * An invoice is generated from a booking's lines, copying description, price
 * and quantity the same way a booking line copies a package's price. It is a
 * billing snapshot: re-pricing a package next month must not rewrite a
 * document a client has already been sent.
 *
 * There is no receipt here, and there should not be. A receipt is what an
 * invoice looks like once its payments cover it — the same document answering
 * a different question. Whether an invoice is paid is derived from the money
 * against it and never stored, so the two cannot disagree.
 */

const INVOICE_SELECT = `
  id, number, status, currency, notes, issued_at, due_at, voided_at, share_token, created_at,
  tax_rate, tax_amount, discount_kind, discount_value, discount_amount,
  booking:bookings(id, title, scheduled_for),
  contact:contacts(id, display_name, email),
  contract:contracts(id, version),
  lines:invoice_lines(id, description, quantity, unit_price, amount, position, booking_line_id),
  payments:financial_transactions(id, kind, type, amount, currency, status, settled_at, created_at, receipt_number, receipt_token)
`;

function shape(row: any) {
  const lines = (row.lines || []).slice().sort((a: any, b: any) => a.position - b.position);
  const subtotal = lines.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
  const payments = row.payments || [];
  // Tax and discount as they were frozen on this document, not as the studio
  // charges or gives today. Both amounts are read back rather than recomputed —
  // see the note where they are written.
  const taxRate = Number(row.tax_rate || 0);
  const discount = Math.round(Math.max(0, Math.min(Number(row.discount_amount || 0), subtotal)) * 100) / 100;
  const net = Math.round((subtotal - discount) * 100) / 100;
  const tax = Number(row.tax_amount || 0);
  const total = Math.round((net + tax) * 100) / 100;
  return {
    ...row,
    lines,
    payments,
    subtotal,
    discount,
    discountKind: (row.discount_kind ?? null) as 'percentage' | 'amount' | null,
    discountValue: row.discount_value == null ? null : Number(row.discount_value),
    /** What is being charged before tax — subtotal less whatever came off it. */
    net,
    taxRate,
    tax,
    total,
    // Settlement is against the total the client was asked for, tax included.
    ...settlementOf(total, payments),
  };
}

/**
 * The tax a studio charges, as a percentage.
 *
 * WHY IT LIVES ON THE STUDIO. invoices.tax_rate and tax_amount existed from the
 * start and were never once written, so every invoice this app has produced was
 * silently tax-free. The rate is a fact about the studio's jurisdiction — one
 * VAT position, not a decision to be retaken per document — and re-declaring it
 * on each invoice is how two invoices in the same month come to disagree.
 *
 * It is SNAPSHOTTED onto each invoice as it is raised. Changing the rate must
 * never rewrite a document a client is already holding, and a rate read live at
 * display time would do exactly that.
 *
 * Zero is a real answer. Plenty of studios charge no tax, and that is a
 * position rather than an omission.
 */
export async function getTaxRate(): Promise<number> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('organizations').select('metadata').eq('id', orgId).maybeSingle();
  return readTaxRate(data?.metadata);
}

function readTaxRate(metadata: unknown): number {
  const raw = (metadata as any)?.finances?.tax_rate;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
}

export async function setTaxRate(percentage: number) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const n = Number(percentage);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error('A tax rate is a percentage between 0 and 100.');
  }

  const { data: org } = await supabaseAdmin
    .from('organizations').select('metadata').eq('id', orgId).maybeSingle();
  const metadata = { ...((org?.metadata as any) || {}) };
  metadata.finances = { ...(metadata.finances || {}), tax_rate: n };

  const { error } = await supabaseAdmin.from('organizations').update({ metadata }).eq('id', orgId);
  if (error) throw new Error('Failed to save the tax rate');

  await logEvent({
    organizationId: orgId,
    entityType: 'organization',
    entityId: orgId,
    action: 'tax_rate_set',
    actorId: actorId ?? undefined,
    payload: { taxRate: n },
  });

  revalidatePath('/finances/settings');
  return { ok: true };
}

/**
 * What a booking is worth, what has been asked for, and what has arrived.
 *
 * THREE FIGURES, NOT TWO. The page showed booked and paid, and called the gap
 * between them "outstanding". That conflates two different questions:
 *
 *   left to invoice = booked  − invoiced   what the studio still has to bill
 *   left to pay     = invoiced − paid      what the client still owes
 *
 * A booking with a 50% deposit raised and settled is fully paid on everything
 * asked for, and still half unbilled. Reading one number as the other is how a
 * studio either chases a client who owes nothing or forgets to send the balance.
 *
 * ALL THREE DERIVED. None is stored, for the same reason settlementOf is not:
 * a total kept beside the lines it came from is a second opinion, and the two
 * disagree the moment an invoice is voided.
 *
 * Void invoices are excluded from `invoiced` — a withdrawn document asked for
 * nothing. It is deliberately still in the list, because withdrawing one is a
 * thing that happened and the audit should show it.
 */
export async function getBookingBilling(bookingId: string) {
  const { orgId } = await getAuthOrgId();

  const [{ data: bookingLines }, { data: invoices }] = await Promise.all([
    supabaseAdmin
      .from('booking_lines')
      .select('id, quantity, title, price, package:packages(name, price)')
      .eq('organization_id', orgId)
      .eq('booking_id', bookingId),
    supabaseAdmin
      .from('invoices')
      .select('id, status, currency, discount_amount, tax_amount, lines:invoice_lines(amount), payments:financial_transactions(kind, amount, status)')
      .eq('organization_id', orgId)
      .eq('booking_id', bookingId),
  ]);

  // What the booking is worth: its own instance of each package, priced.
  let booked = 0;
  let currency: string | null = null;
  for (const l of ((bookingLines || []) as any[])) {
    const price: any = firstPriced(l.package?.price, l.price);
    booked += amountOf(price) * Number(l.quantity ?? 1);
    if (!currency && price?.currency) currency = price.currency;
  }

  let invoiced = 0;
  let paid = 0;
  for (const inv of ((invoices || []) as any[])) {
    if (inv.status === 'void') continue;
    /*
     * NET OF WHAT CAME OFF IT.
     *
     * This summed the lines, which is what was CHARGED before any concession.
     * A booking discounted by twenty thousand would have counted as fully
     * invoiced twenty thousand early, and the guard that refuses to
     * over-invoice would have refused the rest of a booking still owed.
     *
     * booked is pre-tax, so invoiced stays pre-tax too and the two remain
     * comparable — the discount is the only thing subtracted here.
     */
    const lineSum = ((inv.lines || []) as any[]).reduce((n, l) => n + Number(l.amount || 0), 0);
    const off = Math.max(0, Math.min(Number(inv.discount_amount || 0), lineSum));
    const total = Math.round((lineSum - off) * 100) / 100;
    invoiced += total;
    paid += settlementOf(total + Number(inv.tax_amount || 0), inv.payments || []).paid;
    if (!currency && inv.currency) currency = inv.currency;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    booked: round(booked),
    invoiced: round(invoiced),
    paid: round(paid),
    /** Still to bill. Negative would mean over-billed, which the guard prevents. */
    leftToInvoice: round(Math.max(booked - invoiced, 0)),
    /** Still owed on what has been billed. */
    leftToPay: round(Math.max(invoiced - paid, 0)),
    /** True when more has been billed than the booking is worth. */
    overInvoiced: round(invoiced) > round(booked),
    currency: currency || (await getStudioCurrency()),
  };
}

/**
 * Build an invoice from what the booking actually holds.
 *
 * Each booking line becomes an invoice line, described by what the client is
 * getting rather than just the package name — "Portrait Photography · 2
 * outfits" is a line a client can check, "Portrait Photography" is one they
 * have to take on trust.
 */
export async function createInvoiceForBooking(input: {
  bookingId: string;
  lineIds?: string[];
  dueAt?: string | null;
  notes?: string | null;
  /**
   * How much of the booking this invoice is for.
   *
   * A deposit is not a different kind of document — it is an invoice for part
   * of the same work. There used to be two functions producing two shapes, and
   * they drifted: one learned to name the packages it was billing and the other
   * went on writing a single opaque line. One function, one behaviour.
   *
   * Omitted means all of it. A percentage bills that share of every line, so
   * the client can still see what they are paying a deposit ON.
   */
  percentage?: number | null;
  /**
   * What the studio gave away on this document, as it was said.
   *
   * A percentage of the work or a flat sum off it — the two are not the same
   * concession and are recorded as spoken, not flattened into money on the way
   * in. The money is worked out here and frozen beside them.
   *
   * It comes off the SUBTOTAL, before any share. So a 10% discount with a 50%
   * deposit bills half of the discounted work, which is what both of those
   * words mean; taking the deposit first and discounting after would reach the
   * same number by accident today and a different one the moment either changes.
   */
  discount?: { kind: 'percentage' | 'amount'; value: number } | null;
  /** What the client sees against each line, e.g. "50% deposit". */
  label?: string | null;
  /**
   * Bill it even though the booking is already fully invoiced. For the genuine
   * case — re-billing after withdrawing a document, or work agreed by hand —
   * rather than a way around the guard.
   */
  allowOverInvoicing?: boolean;
  /**
   * The studio, for the path that has no session.
   *
   * A client signing a contract on a share link is not logged in, so the
   * organization comes from the link rather than from a session. Passing it is
   * self-consistency, not authorisation — assertOurs below checks the booking
   * really is that studio's, exactly as the public booking path does.
   */
  organizationId?: string;
  contactId?: string | null;
  contractId?: string | null;
}) {
  const session = input.organizationId ? null : await getAuthOrgId();
  const orgId = input.organizationId ?? session!.orgId;
  const actorId = input.contactId ?? session?.personId ?? null;
  if (input.organizationId) {
    await assertOurs(orgId, [
      { table: 'bookings', id: input.bookingId, label: 'booking' },
      { table: 'contacts', id: input.contactId, label: 'client' },
      { table: 'contracts', id: input.contractId, label: 'contract' },
    ]);
  }

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, title, contact_id')
    .eq('id', input.bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking) throw new Error('Booking not found');

  const { data: bookingLines } = await supabaseAdmin
    .from('booking_lines')
    .select('id, quantity, title, price, package:packages(name, price)')
    .eq('organization_id', orgId)
    .eq('booking_id', input.bookingId)
    .order('created_at');

  let lines = (bookingLines || []) as any[];
  if (input.lineIds?.length) lines = lines.filter((l) => input.lineIds!.includes(l.id));
  if (lines.length === 0) {
    throw new Error('There is nothing on this booking to invoice yet.');
  }

  /*
   * Do not bill the same work twice by accident.
   *
   * Nothing checked what had already been asked for, so raising a deposit and
   * then generating an invoice billed the whole booking a second time, silently.
   * The studio would have found out from the client.
   *
   * Refused rather than clamped: quietly reducing the amount would produce a
   * document the operator did not ask for, and they may genuinely mean to bill
   * again after withdrawing one.
   */
  const share = billingShare(input.percentage);
  /*
   * A SHARE OF NOTHING IS NOT AN INVOICE.
   *
   * billingShare(0) is 0, which bills every line at zero and produces a
   * document with a number, a client and no money on it — one that then has to
   * be withdrawn. The new-booking form warned about it beneath the select and
   * submitted it regardless, and a rule enforced only in a browser is not
   * enforced.
   *
   * Null is a different instruction and still means all of it.
   */
  if (input.percentage != null && share <= 0) {
    throw new Error('A deposit of 0% would ask the client for nothing. Set a deposit, or invoice the full amount.');
  }
  if (!input.allowOverInvoicing) {
    const billing = await getBookingBilling(input.bookingId);
    if (billing.leftToInvoice <= 0 && billing.booked > 0) {
      throw new Error(
        `This booking is already invoiced in full (${billing.invoiced} of ${billing.booked}). ` +
        'Withdraw an existing invoice first, or add what else is being billed to the booking.',
      );
    }
  }

  // What each line is configured as, so the description says what was sold.
  const { getLineConfiguration } = await import('@/modules/bookings/interface');
  const { formatVariableValue } = await import('@/modules/services/interface');

  // What a line is for, and what was agreed for it. The booking's own instance
  // of the package holds both; lines made before instancing hold them
  // themselves, and an invoice raised against one of those must still name and
  // price it rather than billing "Booking Line" for nothing.
  const nameOf = (l: any) => (l.package?.name as string) || (l.title as string) || 'Booking line';
  const priceOfLine = (l: any) => firstPriced(l.package?.price, l.price);

  /*
   * An unpriced line cannot be billed.
   *
   * `amountOf` answers 0 for a price nobody has set, which is right for the
   * totals that call it — nothing priced totals as nothing — and wrong here,
   * because this writes that 0 onto a document that goes to a client. Never
   * quoted and quoted at nothing came out identical on the page.
   *
   * Nothing priced at all is refused, the same rule as over-invoicing above:
   * an invoice is a demand for payment and there is no honest amount to demand.
   * A line among priced ones is dropped instead, because refusing there would
   * fail a contract signature over a line the deposit never depended on, and
   * issueDepositInvoice states outright that signing must not fail on a billing
   * guard. What is billed is what was quoted, either way.
   */
  const priced = lines.filter((l) => hasPrice(priceOfLine(l)));
  if (priced.length === 0) {
    throw new Error(
      'Nothing on this booking is priced yet, so there is no amount to invoice. ' +
      'Price the packages on the booking first.',
    );
  }
  lines = priced;

  const currency = (priceOfLine(lines[0]) as any)?.currency || (await getStudioCurrency());

  // Read from the studio directly rather than via getTaxRate(), which needs a
  // session this path may not have.
  const { data: taxOrg } = await supabaseAdmin
    .from('organizations').select('metadata').eq('id', orgId).maybeSingle();
  const taxRate = readTaxRate(taxOrg?.metadata);

  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .insert({
      organization_id: orgId,
      booking_id: booking.id,
      contact_id: input.contactId ?? booking.contact_id,
      contract_id: input.contractId ?? null,
      currency,
      status: 'draft',
      // Frozen at the rate that stood when this was raised, so a later change
      // cannot rewrite a document already in a client's hands.
      tax_rate: taxRate,
      // As it was said, beside what it came to. The amount lands once the lines
      // exist, since a percentage has nothing to be a percentage of until then.
      discount_kind: input.discount?.kind ?? null,
      discount_value: input.discount?.value ?? null,
      notes: input.notes ?? null,
      due_at: input.dueAt ?? null,
    })
    .select('id')
    .single();
  if (error || !invoice) {
    console.error('Failed to create invoice:', error);
    throw new Error('Failed to start that invoice');
  }

  const rows: any[] = [];
  let position = 0;
  for (const l of lines) {
    const title = nameOf(l);
    const price = priceOfLine(l);

    const config = await getLineConfiguration(l.id);
    const detail = config
      .filter((c: any) => c.value != null)
      .map((c: any) => formatVariableValue({ value: c.value, unit: c.unit }))
      .join(' · ');
    const quantity = Number(l.quantity ?? 1);
    const { amount, unitPrice } = invoiceLineAmount({
      unitAmount: amountOf(price), quantity, share,
    });
    rows.push({
      organization_id: orgId,
      invoice_id: invoice.id,
      booking_line_id: l.id,
      description: describeInvoiceLine({ title, details: [detail], label: input.label }),
      quantity,
      unit_price: unitPrice,
      amount,
      position: position++,
    });
  }

  const { error: lineError } = await supabaseAdmin.from('invoice_lines').insert(rows);
  if (lineError) {
    console.error('Failed to write invoice lines:', lineError);
    throw new Error('Failed to write what this invoice is for');
  }

  /*
   * Tax, frozen with the rate that produced it.
   *
   * Stored rather than derived — the exception to the rule elsewhere in this
   * module, and deliberately so. Everything else derived (paid, outstanding)
   * recomputes from facts that are themselves immutable. A tax amount depends
   * on a RATE that changes, so recomputing it later would quietly restate a
   * document. The amount and the rate are frozen together or neither is safe.
   */
  /*
   * The subtotal exists only now, so this is where both frozen figures land.
   *
   * TAX IS CHARGED ON WHAT THE CLIENT IS ASKED FOR, so the discount comes off
   * first and the rate applies to what is left. Taxing the subtotal and
   * discounting afterwards would bill tax on money nobody was charged — a
   * quiet overcharge that would reconcile against nothing.
   */
  const subtotal = rows.reduce((n, r) => n + Number(r.amount || 0), 0);
  /*
   * AN INVOICE FOR HALF THE WORK BILLS HALF THE CONCESSION.
   *
   * The discount is agreed on the JOB, not on this document, so it is worked
   * out against the whole of it and then shared exactly as the lines are.
   *
   * Taking it off the shared subtotal instead would be right for a percentage
   * by accident — ten per cent of half is half of ten per cent — and wrong for
   * a flat sum, which would come off the deposit in full and off the balance
   * in full, giving the same discount away twice.
   */
  const fullSubtotal = lines.reduce(
    (n, l) => n + amountOf(priceOfLine(l)) * Number(l.quantity ?? 1), 0);
  const discount = Math.round(
    discountOn(fullSubtotal, input.discount?.kind ?? null, input.discount?.value ?? null) * share * 100) / 100;
  const { tax } = invoiceTotals({ subtotal, discountAmount: discount, taxRate });
  if (taxRate > 0 || discount > 0) {
    await supabaseAdmin
      .from('invoices')
      .update({ tax_amount: tax, discount_amount: discount })
      .eq('id', invoice.id)
      .eq('organization_id', orgId);
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'invoice',
    entityId: invoice.id,
    action: 'created',
    actorId: actorId ?? undefined,
    payload: { bookingId: booking.id, lineCount: rows.length },
  });

  revalidatePath(`/bookings/${booking.id}`);
  revalidatePath('/finances');
  return { invoiceId: invoice.id };
}

/**
 * Send it. This is where the studio's running number is spent, and where the
 * document freezes — an issued invoice is a thing the client is holding, so
 * the lines stop being editable from here.
 *
 * The number comes from an atomic increment on the organization, so two
 * operators issuing at the same moment cannot land on the same one.
 */
export async function issueInvoice(input: { invoiceId: string; dueAt?: string | null }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('id, status, booking_id')
    .eq('id', input.invoiceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status === 'void') throw new Error('That invoice was withdrawn.');
  if (invoice.status === 'issued') return { ok: true };

  const { count } = await supabaseAdmin
    .from('invoice_lines')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', input.invoiceId)
    .eq('organization_id', orgId);
  if (!count) throw new Error('An invoice with nothing on it can’t be sent.');

  const { data: org, error: seqError } = await supabaseAdmin
    .rpc('next_invoice_number', { org: orgId });
  if (seqError) {
    console.error('Failed to take an invoice number:', seqError);
    throw new Error('Failed to number that invoice');
  }
  const number = `INV-${String(org).padStart(4, '0')}`;

  const { error } = await supabaseAdmin
    .from('invoices')
    .update({
      number,
      status: 'issued',
      issued_at: new Date().toISOString(),
      share_token: randomUUID().replace(/-/g, ''),
      ...(input.dueAt !== undefined ? { due_at: input.dueAt } : {}),
    })
    .eq('id', input.invoiceId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to issue invoice:', error);
    throw new Error('Failed to issue that invoice');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'invoice',
    entityId: input.invoiceId,
    action: 'issued',
    actorId: actorId ?? undefined,
    payload: { number },
  });

  if (invoice.booking_id) revalidatePath(`/bookings/${invoice.booking_id}`);
  revalidatePath('/finances');
  return { ok: true, number };
}

/**
 * A deposit, raised and sent in one go when a client signs.
 *
 * Public path: the client is signing on a share link with no session, so the
 * organization is passed in by the caller that resolved it from the slug.
 *
 * It is one line rather than the booking's lines, because a deposit is not a
 * bill for the work — it is a part payment against the whole. The line says so
 * in words the client can check ("50% deposit"), and the balance invoice
 * raised later carries the actual items.
 *
 * Issued immediately: there is nobody to review a draft at the moment of
 * signing, and a client who has just signed should land on something real.
 */
/**
 * The invoice a client signing a contract is sent straight to.
 *
 * NOT A DIFFERENT KIND OF DOCUMENT. This used to build its own invoice, its own
 * way: a single line reading "50% deposit" with no link to any package, while
 * the operator's path built one line per package. Two implementations of one
 * idea, and they drifted exactly as far apart as you would expect — the client
 * receiving the more important of the two got the less informative one.
 *
 * So it delegates. The only things it still does itself are the two that make
 * it different: it runs with no session, and it ISSUES immediately, because a
 * client who has just signed is being handed the document now rather than
 * having it drafted for someone to send later.
 */
export async function issueDepositInvoice(input: {
  organizationId: string;
  bookingId: string;
  contactId?: string | null;
  contractId?: string | null;
  label: string;
  amount: number;
  currency?: string;
}) {
  const amount = Number(input.amount);
  if (!amount || amount <= 0) throw new Error('A deposit needs an amount.');

  const orgId = input.organizationId;

  /*
   * The amount is given as money, because that is what the contract's terms
   * work out to. Turned into a share of the booking so the lines can each carry
   * their own portion and still say what they are for.
   */
  const billing = await getBookingBilling(input.bookingId);

  /*
   * Do not bill a deposit that has already been billed.
   *
   * A studio can raise the invoice while taking the booking AND send a contract
   * whose deposit is raised on signing. Both are reasonable; together they
   * charged the client twice for the same money, because signing raised its
   * invoice without ever asking what the booking had already been billed.
   *
   * So the shortfall is what gets raised. When there is none, the client is
   * handed the invoice that already exists rather than a duplicate — they came
   * here to pay, and an invoice is waiting for them.
   */
  const shortfall = Math.round((amount - billing.invoiced) * 100) / 100;
  if (shortfall <= 0) {
    const { data: existing } = await supabaseAdmin
      .from('invoices')
      .select('id, number, share_token, status')
      .eq('organization_id', orgId)
      .eq('booking_id', input.bookingId)
      .neq('status', 'void')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Already sent: hand them the document they were going to be sent anyway.
      if (existing.share_token) {
        return {
          invoiceId: existing.id as string,
          number: (existing.number as string) || '',
          token: existing.share_token as string,
          /** Nothing new was raised; this document already covered it. */
          alreadyInvoiced: true,
        };
      }

      /*
       * Still a draft — raised while taking the booking and never sent. The
       * client has just signed and needs something to pay, so this is issued
       * rather than duplicated. Raising a second document for the same money
       * would double what the booking reads as invoiced whether or not the
       * first was ever sent.
       */
      const { data: draftSeq, error: draftSeqError } = await supabaseAdmin
        .rpc('next_document_number', { org: orgId, kind: 'invoice' });
      if (!draftSeqError) {
        const draftNumber = `INV-${String(draftSeq).padStart(4, '0')}`;
        const draftToken = randomUUID().replace(/-/g, '');
        await supabaseAdmin
          .from('invoices')
          .update({ number: draftNumber, status: 'issued', issued_at: new Date().toISOString(), share_token: draftToken })
          .eq('id', existing.id)
          .eq('organization_id', orgId);

        await logEvent({
          organizationId: orgId,
          entityType: 'invoice',
          entityId: existing.id as string,
          action: 'issued',
          actorId: input.contactId ?? undefined,
          payload: { number: draftNumber, amount, viaSigning: true, issuedExistingDraft: true },
        });

        revalidatePath(`/bookings/${input.bookingId}`);
        revalidatePath('/finances');
        return {
          invoiceId: existing.id as string,
          number: draftNumber,
          token: draftToken,
          alreadyInvoiced: true,
        };
      }
    }
  }

  const toBill = shortfall > 0 ? shortfall : amount;
  const percentage = billing.booked > 0
    ? Math.min(100, (toBill / billing.booked) * 100)
    : 100;

  const { invoiceId } = await createInvoiceForBooking({
    organizationId: orgId,
    bookingId: input.bookingId,
    contactId: input.contactId ?? null,
    contractId: input.contractId ?? null,
    percentage,
    label: input.label || 'Deposit',
    // Signing must never fail because of a billing guard. The studio agreed
    // this amount in the contract the client has just signed.
    allowOverInvoicing: true,
  });

  const { data: seq, error: seqError } = await supabaseAdmin
    .rpc('next_document_number', { org: orgId, kind: 'invoice' });
  if (seqError) {
    console.error('Failed to take an invoice number:', seqError);
    throw new Error('Failed to number the deposit invoice');
  }
  const number = `INV-${String(seq).padStart(4, '0')}`;
  const token = randomUUID().replace(/-/g, '');

  await supabaseAdmin
    .from('invoices')
    .update({ number, status: 'issued', issued_at: new Date().toISOString(), share_token: token })
    .eq('id', invoiceId)
    .eq('organization_id', orgId);

  await logEvent({
    organizationId: orgId,
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'issued',
    // The client signing is the actor: their signature is what raised this.
    actorId: input.contactId ?? undefined,
    payload: { number, amount: toBill, requested: amount, viaSigning: true },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/finances');
  return { invoiceId, number, token, alreadyInvoiced: false };
}


/**
 * Withdraw it. Voiding keeps the row and its number: a document that was sent
 * and cancelled is part of the record, and a missing number is worse than a
 * cancelled one. An invoice with money already against it is not voidable —
 * refund it instead, the same rule settled payments follow.
 */
export async function voidInvoice(input: { invoiceId: string; reason?: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('id, status, booking_id, payments:financial_transactions(id, status)')
    .eq('id', input.invoiceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status === 'void') return { ok: true };

  const settled = ((invoice as any).payments || []).some((p: any) => p.status === 'settled');
  if (settled) {
    throw new Error('Money has already been paid against this. Record a refund instead of voiding it.');
  }

  const { error } = await supabaseAdmin
    .from('invoices')
    .update({ status: 'void', voided_at: new Date().toISOString() })
    .eq('id', input.invoiceId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to withdraw that invoice');

  await logEvent({
    organizationId: orgId,
    entityType: 'invoice',
    entityId: input.invoiceId,
    action: 'voided',
    actorId: actorId ?? undefined,
    payload: { reason: input.reason || null },
  });

  if ((invoice as any).booking_id) revalidatePath(`/bookings/${(invoice as any).booking_id}`);
  revalidatePath('/finances');
  return { ok: true };
}

/** Edit a draft: its lines, its due date, its notes. Issued invoices are frozen. */
export async function updateDraftInvoice(input: {
  invoiceId: string;
  dueAt?: string | null;
  notes?: string | null;
  lines?: { description: string; quantity: number; unitPrice: number }[];
}) {
  const { orgId } = await getAuthOrgId();

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('id, status, booking_id')
    .eq('id', input.invoiceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status !== 'draft') {
    throw new Error('This one has been sent. Void it and start another if it’s wrong.');
  }

  const patch: Record<string, unknown> = {};
  if (input.dueAt !== undefined) patch.due_at = input.dueAt;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (Object.keys(patch).length > 0) {
    await supabaseAdmin.from('invoices').update(patch).eq('id', input.invoiceId).eq('organization_id', orgId);
  }

  if (input.lines) {
    // Replace wholesale: the editor sends the list it wants, so a removed line
    // is expressed by absence, the same as service variables.
    await supabaseAdmin.from('invoice_lines').delete().eq('invoice_id', input.invoiceId).eq('organization_id', orgId);
    const rows = input.lines
      .filter((l) => (l.description || '').trim())
      .map((l, i) => {
        const quantity = Number(l.quantity) || 1;
        const unitPrice = Number(l.unitPrice) || 0;
        return {
          organization_id: orgId,
          invoice_id: input.invoiceId,
          description: l.description.trim(),
          quantity,
          unit_price: unitPrice,
          amount: quantity * unitPrice,
          position: i,
        };
      });
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('invoice_lines').insert(rows);
      if (error) throw new Error('Failed to save those lines');
    }
  }

  if (invoice.booking_id) revalidatePath(`/bookings/${invoice.booking_id}`);
  revalidatePath(`/finances/invoices/${input.invoiceId}`);
  return { ok: true };
}

export async function getInvoice(invoiceId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('id', invoiceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return data ? shape(data) : null;
}

export async function listInvoices() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list invoices:', error);
    return [];
  }
  return ((data || []) as any[]).map(shape);
}

/** Every invoice raised against one booking — what the booking page shows. */
export async function listInvoicesForBooking(bookingId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('organization_id', orgId)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });
  return ((data || []) as any[]).map(shape);
}

/**
 * The client's own view, on a share token. Public: no session, exactly like a
 * delivery gallery. A draft has no token, so an unsent invoice is unreachable.
 */
export async function getInvoiceByToken(token: string) {
  if (!token) return null;
  const { data } = await supabaseAdmin
    .from('invoices')
    .select(INVOICE_SELECT + ', organization:organizations(id, name, slug, metadata)')
    .eq('share_token', token)
    .maybeSingle();
  if (!data || (data as any).status === 'draft') return null;
  return shape(data);
}
