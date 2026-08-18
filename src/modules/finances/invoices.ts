'use server';

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertOurs } from '@/kernel/tenancy';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudioCurrency } from '@/kernel/organizations';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import { settlementOf } from './money';

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
  return {
    ...row,
    lines,
    payments,
    subtotal,
    total: subtotal,
    ...settlementOf(subtotal, payments),
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
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, title, contact_id')
    .eq('id', input.bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking) throw new Error('Booking not found');

  const { data: bookingLines } = await supabaseAdmin
    .from('booking_lines')
    .select('id, title, price, quantity')
    .eq('organization_id', orgId)
    .eq('booking_id', input.bookingId)
    .order('created_at');

  let lines = (bookingLines || []) as any[];
  if (input.lineIds?.length) lines = lines.filter((l) => input.lineIds!.includes(l.id));
  if (lines.length === 0) {
    throw new Error('There is nothing on this booking to invoice yet.');
  }

  // What each line is configured as, so the description says what was sold.
  const { getLineConfiguration } = await import('@/modules/bookings/interface');
  const { formatVariableValue } = await import('@/modules/services/interface');

  const currency = (lines[0]?.price as any)?.currency || (await getStudioCurrency());

  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .insert({
      organization_id: orgId,
      booking_id: booking.id,
      contact_id: booking.contact_id,
      currency,
      status: 'draft',
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
    const config = await getLineConfiguration(l.id);
    const detail = config
      .filter((c: any) => c.value != null)
      .map((c: any) => formatVariableValue({ value: c.value, unit: c.unit }))
      .join(' · ');
    const unitPrice = Number((l.price as any)?.base_price || 0);
    const quantity = Number(l.quantity ?? 1);
    rows.push({
      organization_id: orgId,
      invoice_id: invoice.id,
      booking_line_id: l.id,
      description: detail ? `${l.title} · ${detail}` : l.title,
      quantity,
      unit_price: unitPrice,
      amount: unitPrice * quantity,
      position: position++,
    });
  }

  const { error: lineError } = await supabaseAdmin.from('invoice_lines').insert(rows);
  if (lineError) {
    console.error('Failed to write invoice lines:', lineError);
    throw new Error('Failed to write what this invoice is for');
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
  // No session on this path — the studio came from the share link. So this asks
  // whether the booking really is that studio's, not whether the caller may.
  await assertOurs(orgId, [
    { table: 'bookings', id: input.bookingId, label: 'booking' },
    { table: 'contacts', id: input.contactId, label: 'client' },
    { table: 'contracts', id: input.contractId, label: 'contract' },
  ]);

  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .insert({
      organization_id: orgId,
      booking_id: input.bookingId,
      contact_id: input.contactId ?? null,
      contract_id: input.contractId ?? null,
      currency: input.currency || 'USD',
      status: 'draft',
    })
    .select('id')
    .single();
  if (error || !invoice) {
    console.error('Failed to create deposit invoice:', error);
    throw new Error('Failed to raise the deposit');
  }

  const { error: lineError } = await supabaseAdmin.from('invoice_lines').insert({
    organization_id: orgId,
    invoice_id: invoice.id,
    description: input.label || 'Deposit',
    quantity: 1,
    unit_price: amount,
    amount,
    position: 0,
  });
  if (lineError) {
    console.error('Failed to write the deposit line:', lineError);
    throw new Error('Failed to raise the deposit');
  }

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
    .eq('id', invoice.id)
    .eq('organization_id', orgId);

  await logEvent({
    organizationId: orgId,
    entityType: 'invoice',
    entityId: invoice.id,
    action: 'issued',
    // The client signing is the actor: their signature is what raised this.
    actorId: input.contactId ?? undefined,
    payload: { number, amount, viaSigning: true },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/finances');
  return { invoiceId: invoice.id, number, token };
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
