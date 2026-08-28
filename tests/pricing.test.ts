import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * What a thing costs, what was agreed for it, and what tax is added.
 *
 * SEPARATE FROM THE MONEY PATH on purpose. These are facts about pricing —
 * a package's list price against the price agreed on a booking, and the
 * studio's tax position — not about the walk from quote to receipt. They were
 * written into money-path.test.ts and turned it into a catch-all: seven tests
 * deep in one organization, against a remote database, the last of them timed
 * out at two minutes doing work that takes fifty seconds on its own.
 *
 * A test file that grows until its last test times out is telling you the file
 * has stopped being about one thing.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'pricing', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'pricing', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createClient } from '@/modules/clients/domain';
import { createService } from '@/modules/services/domain';
import { createPackage, instantiatePackageForBooking, getPackage, updatePackage } from '@/modules/packages/domain';
import { createBooking, addBookingLine } from '@/modules/bookings/domain';
import {
  getInvoice, createInvoiceForBooking, setTaxRate, getTaxRate,
} from '@/modules/finances/invoices';
import { PURGE_ORDER } from './purge';

describe('Pricing', () => {
  beforeAll(async () => {
    await supabaseAdmin.from('organizations').insert({
      id: TEST_ORG_ID, name: 'Pricing Studio', status: 'active',
    });
    await supabaseAdmin.from('contacts').insert({
      id: TEST_PERSON_ID, organization_id: TEST_ORG_ID, display_name: 'Pricing Owner',
    });
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

  /*
   * Tax, frozen with the rate that produced it.
   *
   * invoices.tax_rate and tax_amount existed from the start and were never once
   * written, so every invoice this app ever produced was silently tax-free.
   */
  it('applies the studio rate and freezes it on the document', async () => {
    const client = await createClient({ name: 'Femi Tax', email: `femi+${randomUUID().slice(0, 8)}@example.com` });
    const clientContactId = (client as any).contactId ?? (client as any).id;
    const { serviceId } = await createService({
      name: 'Taxed Sitting', serviceDomain: 'Photography', primaryDeliverable: 'Edited image',
    });
    const { packageId } = await createPackage({
      name: 'Taxed', serviceIds: [serviceId], price: { base_price: 100000, currency: 'NGN' },
    });
    const { bookingId } = await createBooking({ title: 'Femi — Taxed', contactId: clientContactId });
    await addBookingLine({ bookingId, packageId, title: 'Taxed' });

    await setTaxRate(7.5);
    expect(await getTaxRate()).toBe(7.5);

    const { invoiceId } = await createInvoiceForBooking({ bookingId });
    const invoice: any = await getInvoice(invoiceId);
    expect(Number(invoice.subtotal), 'the net changed').toBe(100000);
    expect(Number(invoice.taxRate), 'the rate was not recorded on the document').toBe(7.5);
    expect(Number(invoice.tax), 'tax was not applied').toBe(7500);
    expect(Number(invoice.total), 'the client was asked for the wrong total').toBe(107500);

    /*
     * The point of freezing it: putting the rate up must not restate a document
     * the client is already holding.
     */
    await setTaxRate(15);
    const unchanged: any = await getInvoice(invoiceId);
    expect(Number(unchanged.taxRate), 'a rate change rewrote an existing invoice').toBe(7.5);
    expect(Number(unchanged.total)).toBe(107500);

    await setTaxRate(0);
  }, 120000);

  /*
   * Discount, derived from two prices rather than stored as a third number.
   */
  it('derives a discount from what the package listed at when it was taken', async () => {
    const { serviceId } = await createService({
      name: 'Discounted Sitting', serviceDomain: 'Photography', primaryDeliverable: 'Edited image',
    });
    const { packageId: catalogId } = await createPackage({
      name: 'List Price Package', serviceIds: [serviceId], price: { base_price: 200000, currency: 'NGN' },
    });

    const { packageId: instanceId } = await instantiatePackageForBooking({ packageId: catalogId });

    // Nothing agreed yet, so nothing is off.
    const atList: any = await getPackage(instanceId);
    expect(atList.discount, 'an undiscounted instance reported a discount').toBeNull();
    expect(Number(atList.listPrice?.amount), 'the instance did not record what it listed at').toBe(200000);

    // The operator agrees 170,000 for this booking.
    await updatePackage({ packageId: instanceId, price: { base_price: 170000, currency: 'NGN' } });
    const agreed: any = await getPackage(instanceId);
    expect(Number(agreed.discount?.amount), 'the discount is not the difference').toBe(30000);
    expect(Number(agreed.price?.amount)).toBe(170000);

    /*
     * And the catalog moving later must not re-baseline it. Without the frozen
     * list price this would read as 80,000 off.
     */
    await updatePackage({ packageId: catalogId, price: { base_price: 250000, currency: 'NGN' } });
    const afterRise: any = await getPackage(instanceId);
    expect(Number(afterRise.discount?.amount), 'a catalog price rise restated an agreed discount').toBe(30000);
  }, 120000);
});
