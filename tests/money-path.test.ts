import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * One booking, all the way to paid.
 *
 * WHY. Eight bookings exist and not one contract has ever been signed, so
 * every step after signing had never run: activation, the deposit invoice, the
 * payment against it, settlement, the receipt. It was the longest stretch of
 * never-executed code in the app and the half that handles money — and every
 * bug found this week lived on a path nothing had exercised.
 *
 * The walk follows what the surfaces actually do, step for step: the studio
 * quotes, the client signs on a share link with no session, signing raises the
 * deposit as a numbered document, the studio records the payment by hand
 * (there is no processor, by decision), and the client can show a receipt.
 * Where a step is a public one it is called the way the public path calls it —
 * with the organization passed in rather than read from a session — because
 * that is the arrangement that has never been tested.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'money-path', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'money-path', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createClient } from '@/modules/clients/domain';
import { createService } from '@/modules/services/domain';
import { createPackage } from '@/modules/packages/domain';
import { createBooking, addBookingLine, createContractForBooking } from '@/modules/bookings/domain';
import { signContract, getContract } from '@/modules/contracts/domain';
import { issueDepositInvoice, getInvoiceByToken, getInvoice } from '@/modules/finances/invoices';
import { createTransaction, settleTransaction, getReceiptForTransaction, getReceiptByToken } from '@/modules/finances/domain';
import { PURGE_ORDER } from './purge';

describe('A booking, all the way to paid', () => {
  beforeAll(async () => {
    await supabaseAdmin.from('organizations').insert({
      id: TEST_ORG_ID, name: 'Money Path Studio', status: 'active',
    });
    await supabaseAdmin.from('contacts').insert({
      id: TEST_PERSON_ID, organization_id: TEST_ORG_ID, display_name: 'Money Path Owner',
    });
    // Every object in a bulk insert must carry the SAME keys — PostgREST
    // answers PGRST102 "All object keys must match" otherwise, and an ignored
    // error here reads later as "no booking stages configured".
    const { error: stageError } = await supabaseAdmin.from('booking_stages').insert([
      { organization_id: TEST_ORG_ID, name: 'Enquiry', kind: 'enquiry', position: 0, is_default: true },
      { organization_id: TEST_ORG_ID, name: 'Booked', kind: 'booked', position: 1, is_default: false },
    ]);
    if (stageError) throw new Error(`Could not seed booking stages: ${stageError.message}`);
  });

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('quotes, signs, invoices, takes the money and shows a receipt', async () => {
    // ── What is being sold ────────────────────────────────────────────────
    const client = await createClient({ name: 'Adaeze Nwoke', email: 'adaeze@example.com' });
    const clientContactId = (client as any).contactId ?? (client as any).id;

    const { serviceId } = await createService({
      name: 'Portrait Session', serviceDomain: 'Photography', primaryDeliverable: 'Edited image',
    });
    const { packageId } = await createPackage({
      name: 'Golden Hour Portrait',
      serviceIds: [serviceId],
      
      
      
    });

    // ── The booking ───────────────────────────────────────────────────────
    const { bookingId } = await createBooking({ title: 'Adaeze — Portrait', contactId: clientContactId });
    await addBookingLine({ bookingId, packageId, title: 'Golden Hour Portrait' });

    // ── The contract the studio sends ─────────────────────────────────────
    const { contractId } = await createContractForBooking(bookingId);
    expect(contractId, 'no contract came back').toBeTruthy();

    const drafted = await getContract(contractId);
    expect(drafted?.status).toBe('proposed');
    const terms = (drafted as any).terms ?? {};
    // The quote is snapshotted onto the contract, so the price cannot move
    // under a client who has already read it.
    expect(Number(terms.base_price), 'the contract did not carry the price').toBe(200000);
    expect(Number(terms.deposit_percentage), 'the contract did not carry the deposit').toBe(50);

    // ── The client signs, on a link, with no session ──────────────────────
    const signed = await signContract({
      contractId,
      signatureName: 'Adaeze Nwoke',
      signatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(signed.status).toBe('active');
    expect((signed as any).signed_at, 'a signed contract with no signing time').toBeTruthy();
    expect((signed.terms as any)?.signature?.name).toBe('Adaeze Nwoke');

    // ── Signing raises the deposit, as the portal does ────────────────────
    const depositAmount = Number(terms.base_price) * (Number(terms.deposit_percentage) / 100);
    const deposit = await issueDepositInvoice({
      organizationId: TEST_ORG_ID,
      bookingId,
      contactId: clientContactId,
      contractId,
      label: '50% deposit',
      amount: depositAmount,
      currency: terms.currency || 'NGN',
    });
    expect(deposit.number, 'the deposit invoice has no number to quote').toMatch(/^INV-\d{4}$/);
    expect(deposit.token, 'the deposit invoice has no share link').toBeTruthy();

    // ── What the client sees on that link ─────────────────────────────────
    const seen: any = await getInvoiceByToken(deposit.token);
    expect(seen, 'the share link resolves to nothing').toBeTruthy();
    expect(seen.status).toBe('issued');
    expect(seen.number).toBe(deposit.number);
    expect(Number(seen.lines?.[0]?.amount ?? seen.invoice_lines?.[0]?.amount), 'the invoice has no line')
      .toBe(depositAmount);

    // ── The studio records the payment, as /finances/invoices/[id] does ───
    const tx: any = await createTransaction({
      kind: 'charge', type: 'Payment', amount: depositAmount,
      currency: terms.currency || 'NGN',
      invoiceId: deposit.invoiceId, contactId: clientContactId, bookingId,
    });
    expect(tx?.id, 'no transaction came back').toBeTruthy();
    await settleTransaction({ transactionId: tx.id });

    // ── And the invoice knows it has been paid ────────────────────────────
    const afterPayment: any = await getInvoice(deposit.invoiceId);
    expect(afterPayment, 'the invoice vanished after payment').toBeTruthy();
    // Whether an invoice is paid is derived from the money against it rather
    // than stored, so this is the assertion that the derivation actually runs.
    expect(Number(afterPayment.paid), 'the invoice does not report what was paid').toBe(depositAmount);
    expect(Number(afterPayment.outstanding), 'a fully paid invoice still shows a balance').toBe(0);
    expect(afterPayment.settled, 'a fully paid invoice does not read as settled').toBe(true);
    expect(afterPayment.partly, 'a fully paid invoice reads as part paid').toBe(false);
    // And the payment is visible ON the invoice, which is where a studio looks.
    expect(afterPayment.payments?.some((p: { id: string }) => p.id === tx.id),
      'the payment is not attached to the invoice').toBe(true);

    // ── The client's proof ────────────────────────────────────────────────
    const receipt: any = await getReceiptForTransaction(tx.id);
    expect(receipt, 'a settled payment produced no receipt').toBeTruthy();
    expect(receipt.receipt_number, 'a settled payment has no receipt number').toMatch(/^RCT-\d{4}$/);
    expect(receipt.receipt_issued_at, 'a receipt with no issue time').toBeTruthy();
    const receiptToken = receipt.receipt_token;
    expect(receiptToken, 'the receipt has no share link').toBeTruthy();

    const seenReceipt: any = await getReceiptByToken(receiptToken);
    expect(seenReceipt, 'the receipt link resolves to nothing').toBeTruthy();
    expect(Number(seenReceipt.amount)).toBe(depositAmount);
  }, 120000);
});
