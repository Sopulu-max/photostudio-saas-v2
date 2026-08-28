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
import { createPackage, instantiatePackageForBooking, getPackage, updatePackage } from '@/modules/packages/domain';
import { createBooking, addBookingLine, createContractForBooking } from '@/modules/bookings/domain';
import { signContract, getContract, setDepositDefault } from '@/modules/contracts/domain';
import {
  issueDepositInvoice, getInvoiceByToken, getInvoice,
  createInvoiceForBooking, getBookingBilling, setTaxRate, getTaxRate,
} from '@/modules/finances/invoices';
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
      price: { base_price: 200000, currency: 'NGN' },
    });

    /*
     * What the studio asks for up front, set where it now lives.
     *
     * This used to be two arguments on the package — paymentPolicy and
     * depositPercentage. Both were removed when payment terms moved off the
     * package, and for a while nothing replaced them: the draft path hardcoded
     * zero, so this test asked a contract for a deposit that no code path could
     * produce. It is a Contracts setting now, and asking for it there is the
     * assertion that the move actually completed.
     */
    await setDepositDefault(50);

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

    // ── The deposit invoice knows what it is a deposit ON ─────────────────
    /*
     * The whole point of the rework: this invoice used to be a single line
     * reading "50% deposit" with no booking_line_id, so nothing downstream
     * could tell what was being paid for. A client cannot check a lump sum, and
     * a studio cannot reconcile one.
     */
    const depositLines = (seen.lines ?? seen.invoice_lines ?? []) as any[];
    expect(depositLines.length, 'the deposit invoice has no lines').toBeGreaterThan(0);
    expect(depositLines[0].booking_line_id, 'the deposit line is not tied to a package').toBeTruthy();
    expect(String(depositLines[0].description), 'the deposit line does not name the package')
      .toContain('Golden Hour Portrait');
    // And the lines add up to what was actually asked for, to the naira.
    const lineSum = depositLines.reduce((n, l) => n + Number(l.amount || 0), 0);
    expect(Math.round(lineSum * 100) / 100, 'the deposit lines do not sum to the deposit')
      .toBe(depositAmount);

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

  /*
   * Booked, invoiced and paid are three different questions.
   *
   * The page used to show two and call the gap "outstanding", which conflated
   * "what the studio still has to bill" with "what the client still owes". A
   * booking with a settled 50% deposit is fully paid on everything asked for and
   * still half unbilled; reading one as the other is how a studio chases a
   * client who owes nothing, or forgets to send the balance.
   *
   * And nothing stopped the same work being billed twice — raise a deposit, hit
   * Generate Invoice, and the whole booking went out again, silently.
   */
  it('tells booked, invoiced and paid apart, and refuses to bill twice', async () => {
    const client = await createClient({ name: 'Ngozi Bill', email: `ngozi+${randomUUID().slice(0, 8)}@example.com` });
    const clientContactId = (client as any).contactId ?? (client as any).id;

    const { serviceId } = await createService({
      name: 'Event Coverage', serviceDomain: 'Photography', primaryDeliverable: 'Edited image',
    });
    const { packageId } = await createPackage({
      name: 'Event Day', serviceIds: [serviceId], price: { base_price: 100000, currency: 'NGN' },
    });
    const { bookingId } = await createBooking({ title: 'Ngozi — Event', contactId: clientContactId });
    await addBookingLine({ bookingId, packageId, title: 'Event Day' });

    const start = await getBookingBilling(bookingId);
    expect(start.booked, 'the booking is not worth what its package costs').toBe(100000);
    expect(start.invoiced).toBe(0);
    expect(start.leftToInvoice).toBe(100000);

    // Half of it, as a deposit would be.
    await createInvoiceForBooking({ bookingId, percentage: 50, label: '50% deposit' });

    const half = await getBookingBilling(bookingId);
    expect(half.invoiced, 'a half invoice did not bill half').toBe(50000);
    expect(half.leftToInvoice, 'the balance still to bill is wrong').toBe(50000);
    // Nothing has been paid, so what the CLIENT owes is what was billed —
    // a different number from what the studio still has to bill.
    expect(half.leftToPay).toBe(50000);
    expect(half.paid).toBe(0);

    // The balance.
    await createInvoiceForBooking({ bookingId, percentage: 50, label: 'Balance' });
    const full = await getBookingBilling(bookingId);
    expect(full.invoiced).toBe(100000);
    expect(full.leftToInvoice).toBe(0);

    // And now a third would be billing work that was already billed.
    await expect(createInvoiceForBooking({ bookingId }))
      .rejects.toThrow(/already invoiced in full/i);

    // Unless the operator means it — after withdrawing one, say.
    const forced = await createInvoiceForBooking({ bookingId, allowOverInvoicing: true });
    expect(forced.invoiceId, 'the deliberate case was blocked too').toBeTruthy();
  }, 120000);

  it('names the package on every line of a part invoice', async () => {
    const { data: invoices } = await supabaseAdmin
      .from('invoices').select('id, lines:invoice_lines(description, amount, booking_line_id)')
      .eq('organization_id', TEST_ORG_ID);
    const partial = ((invoices || []) as any[])
      .flatMap((i) => i.lines || [])
      .filter((l: any) => String(l.description).includes('50% deposit'));

    expect(partial.length, 'no part-invoice line was written').toBeGreaterThan(0);

    /*
     * The point of collapsing the two functions: EVERY part-invoice line says
     * what it is a deposit ON and points back at the work. Asserted across all
     * of them rather than the first, because both bookings in this file raise
     * one and the claim is about the shape, not about a particular row.
     */
    for (const line of partial) {
      const described = String(line.description);
      expect(described, 'a deposit line named nothing but the deposit')
        .toMatch(/^(Golden Hour Portrait|Event Day).* — 50% deposit$/);
      expect(line.booking_line_id, `"${described}" lost its link to the work`).toBeTruthy();
    }
  }, 60000);

  /*
   * The interaction that raising an invoice at booking time creates.
   *
   * A studio can invoice while taking the booking AND send a contract whose
   * deposit is raised on signing. Both are reasonable; together they charged the
   * client twice for the same money, because signing raised its invoice without
   * ever asking what the booking had already been billed.
   */
  it('does not raise a second deposit for money already invoiced', async () => {
    const client = await createClient({ name: 'Tunde Twice', email: `tunde+${randomUUID().slice(0, 8)}@example.com` });
    const clientContactId = (client as any).contactId ?? (client as any).id;

    const { serviceId } = await createService({
      name: 'Studio Sitting', serviceDomain: 'Photography', primaryDeliverable: 'Edited image',
    });
    const { packageId } = await createPackage({
      name: 'Sitting', serviceIds: [serviceId], price: { base_price: 80000, currency: 'NGN' },
    });
    const { bookingId } = await createBooking({ title: 'Tunde — Sitting', contactId: clientContactId });
    await addBookingLine({ bookingId, packageId, title: 'Sitting' });

    // The studio invoices the 50% deposit while taking the booking.
    await createInvoiceForBooking({ bookingId, percentage: 50, label: '50% deposit' });
    const afterForm = await getBookingBilling(bookingId);
    expect(afterForm.invoiced).toBe(40000);

    // Then the client signs a contract whose terms name the same deposit.
    const result = await issueDepositInvoice({
      organizationId: TEST_ORG_ID,
      bookingId,
      contactId: clientContactId,
      label: '50% deposit',
      amount: 40000,
      currency: 'NGN',
    });

    // Nothing new was raised, and they were handed the invoice that exists.
    expect(result.alreadyInvoiced, 'signing billed the deposit a second time').toBe(true);
    expect(result.token, 'the client was left without an invoice to pay').toBeTruthy();

    const afterSigning = await getBookingBilling(bookingId);
    expect(afterSigning.invoiced, 'the booking was billed twice for one deposit').toBe(40000);
    expect(afterSigning.leftToInvoice).toBe(40000);
  }, 120000);

  it('raises only the shortfall when part of the deposit is already billed', async () => {
    const client = await createClient({ name: 'Sade Part', email: `sade+${randomUUID().slice(0, 8)}@example.com` });
    const clientContactId = (client as any).contactId ?? (client as any).id;

    const { serviceId } = await createService({
      name: 'Half Sitting', serviceDomain: 'Photography', primaryDeliverable: 'Edited image',
    });
    const { packageId } = await createPackage({
      name: 'Half', serviceIds: [serviceId], price: { base_price: 100000, currency: 'NGN' },
    });
    const { bookingId } = await createBooking({ title: 'Sade — Half', contactId: clientContactId });
    await addBookingLine({ bookingId, packageId, title: 'Half' });

    // 20% billed at booking; the contract then asks for a 50% deposit.
    await createInvoiceForBooking({ bookingId, percentage: 20, label: 'Booking fee' });
    await issueDepositInvoice({
      organizationId: TEST_ORG_ID, bookingId, contactId: clientContactId,
      label: '50% deposit', amount: 50000, currency: 'NGN',
    });

    // 20,000 was already asked for, so only the remaining 30,000 is raised.
    const billing = await getBookingBilling(bookingId);
    expect(billing.invoiced, 'the shortfall was not what got billed').toBe(50000);
    expect(billing.leftToInvoice).toBe(50000);
  }, 120000);

});
