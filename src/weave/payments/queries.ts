import 'server-only';

import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { BookingPackage } from '@/weave/bookings/shape';
import {
  INVOICE_TOKEN, priceForInvoice,
  type BookingBilling, type BookingInvoice, type ClientInvoice, type InvoicePackageLine, type InvoiceSummary, type InvoiceTerms,
  type ReceiptPayment, type SharedInvoice,
} from './shape';

const SUMMARY = 'number, client_name, description, currency, total_minor, deposit_minor, '
  + 'issued_at, voided_at, invoice_received_minor';
const TERMS = SUMMARY + ', instructions, package_lines';
const STUDIO_INVOICE = TERMS + ', id, share_token, payments:booking_payments(id, amount_minor, received_on, reference, voided_at)';
const RECEIPTS = 'payments:booking_payments(id, amount_minor, received_on)';

type SummaryRow = {
  number: number;
  client_name: string | null;
  description: string;
  currency: string;
  total_minor: number;
  deposit_minor: number | null;
  issued_at: string;
  voided_at: string | null;
  invoice_received_minor: number;
};

type TermsRow = SummaryRow & { instructions: string | null; package_lines: InvoicePackageLine[] };
type PackageRow = {
  position: number; package_id: string | null; name: string;
  quantity: number; unit_price_minor: number | null; currency: string;
};
type ReceiptRow = { id: string; amount_minor: number; received_on: string };
type StudioInvoiceRow = TermsRow & {
  id: string;
  share_token: string;
  payments: (ReceiptRow & { reference: string | null; voided_at: string | null })[];
};

function receiptPayment(row: ReceiptRow): ReceiptPayment {
  return { id: row.id, amountMinor: row.amount_minor, receivedOn: row.received_on };
}

function summary(row: SummaryRow): Omit<InvoiceTerms, 'instructions'> {
  return {
    number: row.number,
    clientName: row.client_name,
    description: row.description,
    currency: row.currency,
    totalMinor: row.total_minor,
    depositMinor: row.deposit_minor,
    issuedAt: row.issued_at,
    voidedAt: row.voided_at,
    receivedMinor: row.invoice_received_minor,
  };
}

function terms(row: TermsRow): InvoiceTerms & { packageLines: InvoicePackageLine[] } {
  return { ...summary(row), instructions: row.instructions, packageLines: row.package_lines };
}

function studioInvoice(row: StudioInvoiceRow): BookingInvoice {
  return {
    ...terms(row), id: row.id, shareToken: row.share_token,
    payments: row.payments.map((payment) => ({
      ...receiptPayment(payment), reference: payment.reference, voidedAt: payment.voided_at,
    })),
  };
}

export async function bookingInvoicesPage(before: number | null): Promise<{
  invoices: InvoiceSummary[];
  nextBefore: number | null;
} | null> {
  const who = await whoIsAsking();
  if (!who) return null;

  const pageSize = 30;
  const query = db.from('booking_invoices')
    .select(SUMMARY + ', booking_id')
    .eq('studio_id', who.studioId)
    .order('number', { ascending: false })
    .limit(pageSize + 1);
  if (before !== null) query.lt('number', before);

  const { data, error } = await query;
  if (error) {
    console.error('Payments list unavailable:', error.code);
    return null;
  }

  const rows = (data ?? []) as unknown as (SummaryRow & { booking_id: string })[];
  const invoices = rows.slice(0, pageSize).map((row) => ({
    ...summary(row), bookingId: row.booking_id,
  }));
  return {
    invoices,
    nextBefore: rows.length > pageSize ? rows[pageSize - 1].number : null,
  };
}

export async function bookingBilling(bookingId: string): Promise<BookingBilling | null> {
  const who = await whoIsAsking();
  if (!who) return null;

  const [booking, invoices] = await Promise.all([
    db.from('bookings')
      .select('accepted_at, packages:booking_packages(position, package_id, name, quantity, unit_price_minor, currency)')
      .eq('studio_id', who.studioId).eq('id', bookingId)
      .eq('packages.studio_id', who.studioId)
      .order('position', { referencedTable: 'packages' }).maybeSingle(),
    db.from('booking_invoices')
      .select(STUDIO_INVOICE)
      .eq('studio_id', who.studioId).eq('booking_id', bookingId)
      .order('number', { ascending: false })
      .order('received_on', { referencedTable: 'payments', ascending: false })
      .order('recorded_at', { referencedTable: 'payments', ascending: false }),
  ]);

  if (booking.error || invoices.error) {
    console.error('Booking billing unavailable:', booking.error?.code, invoices.error?.code);
    return null;
  }
  if (!booking.data) return null;

  const row = booking.data as unknown as { accepted_at: string | null; packages: PackageRow[] };
  const packages: BookingPackage[] = row.packages.map((pack) => ({
    position: pack.position, packageId: pack.package_id, name: pack.name,
    quantity: pack.quantity, unitMinor: pack.unit_price_minor, currency: pack.currency,
  }));
  return {
    confirmed: row.accepted_at !== null,
    packages,
    price: priceForInvoice(packages),
    invoices: ((invoices.data ?? []) as unknown as StudioInvoiceRow[]).map(studioInvoice),
  };
}

export async function bookingInvoiceDetails(number: number): Promise<(BookingInvoice & { bookingId: string }) | null> {
  const who = await whoIsAsking();
  if (!who || !Number.isSafeInteger(number) || number < 1) return null;

  const { data, error } = await db.from('booking_invoices')
    .select(`${STUDIO_INVOICE}, booking_id`)
    .eq('studio_id', who.studioId).eq('number', number)
    .order('received_on', { referencedTable: 'payments', ascending: false })
    .order('recorded_at', { referencedTable: 'payments', ascending: false })
    .maybeSingle();

  if (error) {
    console.error('Invoice details unavailable:', error.code);
    throw new Error('Invoice details unavailable');
  }
  if (!data) return null;

  const row = data as unknown as StudioInvoiceRow & { booking_id: string };
  return { ...studioInvoice(row), bookingId: row.booking_id };
}

/** The studio reads the original billed person's history, even after booking edits. */
export async function clientInvoices(clientId: string): Promise<ClientInvoice[] | null> {
  const who = await whoIsAsking();
  if (!who || !INVOICE_TOKEN.test(clientId)) return null;

  const { data, error } = await db.from('booking_invoices')
    .select(`${SUMMARY}, booking_id, share_token, ${RECEIPTS}`)
    .eq('studio_id', who.studioId).eq('client_id', clientId)
    .is('payments.voided_at', null)
    .order('number', { ascending: false })
    .order('received_on', { referencedTable: 'payments', ascending: false })
    .order('recorded_at', { referencedTable: 'payments', ascending: false });

  if (error) {
    console.error('Client invoices unavailable:', error.code);
    return null;
  }

  const rows = data as unknown as (SummaryRow & {
    booking_id: string; share_token: string; payments: ReceiptRow[];
  })[];
  return rows.map((row) => ({
    ...summary(row), bookingId: row.booking_id, shareToken: row.share_token,
    payments: row.payments.map(receiptPayment),
  }));
}

/** The private link confers access to one invoice and its recorded receipts. */
export async function sharedInvoice(token: string, paymentId?: string): Promise<SharedInvoice | null> {
  if (!INVOICE_TOKEN.test(token) || (paymentId !== undefined && !INVOICE_TOKEN.test(paymentId))) return null;
  const query = db.from('booking_invoices')
    .select(`${TERMS}, studio:studios(name), ${RECEIPTS}`)
    .eq('share_token', token)
    .is('payments.voided_at', null)
    .order('received_on', { referencedTable: 'payments', ascending: false })
    .order('recorded_at', { referencedTable: 'payments', ascending: false });
  if (paymentId) query.eq('payments.id', paymentId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('Shared invoice unavailable:', error.code);
    throw new Error('Invoice unavailable');
  }
  if (!data) return null;

  const row = data as unknown as TermsRow & { studio: { name: string }; payments: ReceiptRow[] };
  return { ...terms(row), studioName: row.studio.name, payments: row.payments.map(receiptPayment) };
}
