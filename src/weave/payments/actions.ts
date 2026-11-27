'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import { INVOICE_TOKEN } from './shape';
import { invoiceFrom, paymentFrom } from './forms';

type Result = { ok: true } | { ok: false; problem: string };
type Command = 'issue_booking_invoice' | 'record_booking_payment' | 'void_booking_payment' | 'void_booking_invoice';

async function write(
  bookingId: string,
  command: Command,
  values: Record<string, string | number | null>,
): Promise<Result> {
  const who = await whoIsAsking();
  if (!who) return { ok: false, problem: 'Sign in to manage booking payments.' };
  if (!INVOICE_TOKEN.test(bookingId)) return { ok: false, problem: 'Booking unavailable.' };

  const { error } = await db.rpc(command, {
    ...values,
    p_booking_id: bookingId,
    p_studio_id: who.studioId,
    p_actor_id: who.personId,
  });

  if (error) {
    if (error.code === 'P0001') return { ok: false, problem: error.message };
    console.error('Booking payment write failed:', command, error.code);
    return { ok: false, problem: 'Could not save the payment record. Try again.' };
  }

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/payments');
  revalidatePath('/payments/[number]', 'page');
  revalidatePath('/clients/[id]', 'page');
  return { ok: true };
}

export async function issueInvoice(bookingId: string, form: FormData): Promise<Result> {
  let invoice;
  try {
    invoice = invoiceFrom(form);
  } catch (error) {
    return { ok: false, problem: error instanceof Error ? error.message : 'Invalid invoice details.' };
  }
  return write(bookingId, 'issue_booking_invoice', {
    p_description: null, p_currency: invoice.currency, p_total_minor: invoice.total_minor,
    p_deposit_minor: invoice.deposit_minor, p_instructions: invoice.instructions,
  });
}

export async function recordPayment(
  bookingId: string, invoiceId: string, paymentId: string, form: FormData,
): Promise<Result> {
  if (!INVOICE_TOKEN.test(invoiceId) || !INVOICE_TOKEN.test(paymentId)) {
    return { ok: false, problem: 'Payment record unavailable.' };
  }
  let payment;
  try {
    payment = paymentFrom(form);
  } catch (error) {
    return { ok: false, problem: error instanceof Error ? error.message : 'Invalid payment details.' };
  }
  return write(bookingId, 'record_booking_payment', {
    p_invoice_id: invoiceId, p_payment_id: paymentId, p_amount_minor: payment.amount_minor,
    p_received_on: payment.received_on, p_reference: payment.reference,
  });
}

export async function voidPayment(bookingId: string, invoiceId: string, paymentId: string): Promise<Result> {
  if (!INVOICE_TOKEN.test(invoiceId) || !INVOICE_TOKEN.test(paymentId)) {
    return { ok: false, problem: 'Payment record unavailable.' };
  }
  return write(bookingId, 'void_booking_payment', { p_invoice_id: invoiceId, p_payment_id: paymentId });
}

export async function voidInvoice(bookingId: string, invoiceId: string): Promise<Result> {
  if (!INVOICE_TOKEN.test(invoiceId)) return { ok: false, problem: 'Invoice unavailable.' };
  return write(bookingId, 'void_booking_invoice', { p_invoice_id: invoiceId });
}
