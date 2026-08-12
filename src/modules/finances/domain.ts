'use server';

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/kernel/events';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudioCurrency } from '@/kernel/organizations';
import { KINDS, kindOf, totalsByCurrency } from './money';
import type { TransactionKind, MoneyTotals } from './money';
import type { FinancialTransaction } from '@/lib/types/engine';

/**
 * Money the studio records itself — a cost, a one-off charge, anything the
 * booking flow didn't raise.
 *
 * The organization and the actor are read from the session, never accepted
 * from the caller. They used to be parameters, and the only caller was a
 * browser component passing them in as props: that let a signed-in operator
 * write a transaction into another studio's books, and claim any colleague as
 * the person who did it. RLS could not catch it because this runs as the
 * service role.
 */
export async function createTransaction(params: {
  contractId?: string;
  contactId?: string;
  bookingId?: string;
  /** Pays this invoice down. Omitted for costs, or money taken before billing. */
  invoiceId?: string;
  kind: TransactionKind;
  /** The studio's own label beneath the kind — "Equipment", "Deposit". */
  type: string;
  amount: number;
  currency?: string;
  dueDate?: string;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const amount = Number(params.amount);
  if (!amount || amount <= 0) throw new Error('Enter an amount.');
  if (!KINDS[params.kind]) throw new Error('Say what kind of money this is.');

  const { data: transaction, error } = await supabaseAdmin
    .from('financial_transactions')
    .insert({
      organization_id: orgId,
      contract_id: params.contractId || null,
      contact_id: params.contactId || null,
      booking_id: params.bookingId || null,
      invoice_id: params.invoiceId || null,
      kind: params.kind,
      // Derived, never taken on trust: an inbound expense is not a thing.
      direction: KINDS[params.kind].direction,
      type: (params.type || '').trim() || params.kind,
      amount,
      currency: params.currency || (await getStudioCurrency()),
      status: 'pending',
      due_date: params.dueDate || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create transaction:', error);
    throw new Error('Failed to create transaction');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'financial_transaction',
    entityId: transaction.id,
    action: 'created',
    actorId: actorId ?? undefined,
    payload: { kind: params.kind, type: params.type, amount },
  });

  return transaction as FinancialTransaction;
}

/**
 * Mark money as actually moved. One transition for both ways it happens —
 * an operator confirming a bank transfer, and a client paying through the
 * portal — because it is the same fact about the same money. It used to be
 * two functions logging two different actions, so "was this paid" had two
 * answers depending on which door it came through.
 *
 * `paidBy` carries the client's contact on the portal path, where there is no
 * session to read an actor from.
 */
export async function settleTransaction(input: {
  transactionId: string;
  /** Public path only — the portal has no session. Operators must omit it. */
  organizationId?: string;
  paidBy?: string | null;
}) {
  let orgId = input.organizationId;
  let actorId: string | null = input.paidBy ?? null;
  if (!orgId) {
    const auth = await getAuthOrgId();
    orgId = auth.orgId;
    actorId = auth.personId;
  }

  const { data: existing } = await supabaseAdmin
    .from('financial_transactions')
    .select('id, status, kind, type, receipt_number')
    .eq('id', input.transactionId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!existing) throw new Error('Transaction not found');
  if (existing.status === 'settled') return existing as FinancialTransaction;
  if (existing.status === 'voided') throw new Error('That one was voided — it can’t be settled.');

  // Money that came from or went back to a client earns its acknowledgement
  // the moment it moves. Not a separate step an operator has to remember: the
  // client is owed the receipt as soon as they've paid, and a receipt nobody
  // issued is the same as no receipt.
  const spec = KINDS[kindOf(existing)];
  let receipt: { number: string; token: string } | null = null;
  if (spec.clientFacing && !existing.receipt_number) {
    const { data: seq, error: seqError } = await supabaseAdmin
      .rpc('next_document_number', { org: orgId, kind: 'receipt' });
    if (seqError) {
      console.error('Failed to take a receipt number:', seqError);
      throw new Error('Failed to number the receipt for that payment');
    }
    receipt = {
      number: `RCT-${String(seq).padStart(4, '0')}`,
      token: randomUUID().replace(/-/g, ''),
    };
  }

  const { data: transaction, error } = await supabaseAdmin
    .from('financial_transactions')
    .update({
      status: 'settled',
      settled_at: new Date().toISOString(),
      ...(receipt ? {
        receipt_number: receipt.number,
        receipt_issued_at: new Date().toISOString(),
        receipt_token: receipt.token,
      } : {}),
    })
    .eq('id', input.transactionId)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) {
    console.error('Failed to settle transaction:', error);
    throw new Error('Failed to settle transaction');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'financial_transaction',
    entityId: transaction.id,
    action: 'settled',
    actorId: actorId ?? undefined,
    payload: {
      amount: transaction.amount,
      currency: transaction.currency,
      kind: transaction.kind,
      receiptNumber: receipt?.number ?? null,
    },
  });

  return transaction as FinancialTransaction;
}

/**
 * A receipt, on its share token. Public: no session, like a gallery or an
 * invoice link. The payment carries the document, so this reads the payment
 * and everything it points at.
 */
export async function getReceiptByToken(token: string) {
  if (!token) return null;
  const { data } = await supabaseAdmin
    .from('financial_transactions')
    .select(`
      id, kind, type, amount, currency, status, settled_at, created_at,
      receipt_number, receipt_issued_at,
      contact:contacts(id, display_name, email),
      booking:bookings(id, title, scheduled_for),
      invoice:invoices(id, number, currency, lines:invoice_lines(amount), payments:financial_transactions(kind, amount, status)),
      organization:organizations(id, name, slug, metadata)
    `)
    .eq('receipt_token', token)
    .maybeSingle();
  if (!data || (data as any).status !== 'settled') return null;
  return data as any;
}

/** The same, for the studio's own page. */
export async function getReceiptForTransaction(transactionId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('financial_transactions')
    .select('id, receipt_number, receipt_issued_at, receipt_token')
    .eq('id', transactionId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return data;
}

/**
 * Withdraw money that should never have been recorded — a duplicate invoice, a
 * mistyped cost. Voiding keeps the row: the studio's books should show that
 * something was raised and withdrawn, not quietly lose it. Settled money is
 * not voidable, because money that actually moved is a fact — refund it.
 */
export async function voidTransaction(input: { transactionId: string; reason?: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: existing } = await supabaseAdmin
    .from('financial_transactions')
    .select('id, status')
    .eq('id', input.transactionId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!existing) throw new Error('Transaction not found');
  if (existing.status === 'settled') {
    throw new Error('That money already moved. Record a refund instead of voiding it.');
  }
  if (existing.status === 'voided') return { ok: true };

  const { error } = await supabaseAdmin
    .from('financial_transactions')
    .update({ status: 'voided', voided_at: new Date().toISOString() })
    .eq('id', input.transactionId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to void transaction:', error);
    throw new Error('Failed to void that transaction');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'financial_transaction',
    entityId: input.transactionId,
    action: 'voided',
    actorId: actorId ?? undefined,
    payload: { reason: input.reason || null },
  });

  return { ok: true };
}

/**
 * Raise an invoice against a booking — the composition path. No contract
 * required (the kernel is unlocked). The payer is a kernel contact, with
 * person_id mirrored while the legacy column still exists.
 */
export async function raiseInvoiceForBooking(input: {
  organizationId: string;
  bookingId: string;
  contactId?: string | null;
  contractId?: string | null;
  label: string;
  amount: number;
  currency?: string;
  actorId?: string | null;
}) {
  const amount = Number(input.amount);
  if (!amount || amount <= 0) throw new Error('Enter an amount.');

  const { data: tx, error } = await supabaseAdmin
    .from('financial_transactions')
    .insert({
      organization_id: input.organizationId,
      booking_id: input.bookingId,
      contact_id: input.contactId ?? null,
      contract_id: input.contractId ?? null,
      // Always a charge: this is what a client owes for booked work. The label
      // ("deposit", "balance") is the studio's word for it, beneath the kind.
      kind: 'charge',
      direction: 'inbound',
      type: (input.label || '').trim() || 'invoice',
      amount,
      currency: input.currency || 'USD',
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !tx) {
    console.error('Failed to raise invoice:', error);
    throw new Error('Failed to raise invoice');
  }

  await logEvent({
    organizationId: input.organizationId,
    entityType: 'financial_transaction',
    entityId: tx.id,
    action: 'created',
    actorId: input.actorId ?? undefined,
    payload: { bookingId: input.bookingId, amount },
  });

  return { transactionId: tx.id };
}

/** Every transaction for this org — the ledger. */
export async function listTransactions() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('financial_transactions')
    .select('id, type, kind, direction, amount, currency, status, due_date, settled_at, voided_at, created_at, contact:contacts(id, display_name), contract:contracts(id, version), booking:bookings(id, title)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list transactions:', error);
    return [];
  }
  return data || [];
}

/** The money raised against one contract, oldest first — deposit then balance. */
export async function listTransactionsForContract(contractId: string) {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('financial_transactions')
    .select('id, type, direction, amount, currency, status, created_at')
    .eq('organization_id', orgId)
    .eq('contract_id', contractId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Failed to list transactions for contract:', error);
    return [];
  }
  return (data || []) as any[];
}

/** One transaction, with what it's tied to. */
export async function getTransaction(transactionId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('financial_transactions')
    .select('id, type, kind, direction, amount, currency, status, due_date, settled_at, voided_at, created_at, booking:bookings(id, title), contact:contacts(id, display_name, email), contract:contracts(id, version)')
    .eq('id', transactionId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return data;
}

/**
 * What a client has actually paid, net of refunds — the same settled-inbound-
 * minus-settled-outbound netting used on a single booking, rolled up across
 * every booking for this contact.
 */
export async function getPaymentSummaryForContact(contactId: string): Promise<{ paid: number; pending: number; currency: string }> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('financial_transactions')
    .select('amount, currency, status, direction, kind, type')
    .eq('organization_id', orgId)
    .eq('contact_id', contactId);

  // A client's own money only: what the studio spent has a contact on it
  // sometimes (a freelancer being paid is a contact too) and that is not this
  // person paying for anything.
  const theirs = ((data || []) as any[]).filter((t) => KINDS[kindOf(t)].clientFacing);
  const totals = totalsByCurrency(theirs, await getStudioCurrency());
  const main = totals[0];
  return {
    paid: main?.earned ?? 0,
    pending: main?.owed ?? 0,
    currency: main?.currency ?? (await getStudioCurrency()),
  };
}

/** The studio's money, split by currency and by what each figure means. */
export async function getMoneyTotals(): Promise<MoneyTotals[]> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('financial_transactions')
    .select('amount, currency, status, direction, kind, type')
    .eq('organization_id', orgId);
  return totalsByCurrency((data || []) as any[], await getStudioCurrency());
}

/**
 * Money falling due within a window — the calendar's money layer.
 */
export async function listDueInRange(fromISO: string, toISO: string) {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('financial_transactions')
    .select('id, type, amount, currency, status, due_date, booking:bookings(id, title)')
    .eq('organization_id', orgId)
    .not('due_date', 'is', null)
    .gte('due_date', fromISO)
    .lte('due_date', toISO)
    .order('due_date');
  if (error) {
    console.error('Failed to list money due:', error);
    return [];
  }

  return ((data || []) as any[]).map((t) => ({
    kind: 'money' as const,
    at: t.due_date,
    transactionId: t.id,
    title: String(t.type).replace(/_/g, ' '),
    amount: Number(t.amount || 0),
    currency: t.currency || 'USD',
    status: t.status,
    bookingId: t.booking?.id ?? null,
    bookingTitle: t.booking?.title ?? null,
  }));
}
