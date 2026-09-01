import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * EVERY FIELD ON THE NEW BOOKING FORM, FOLLOWED TO THE ROW IT LANDS IN.
 *
 * The form asks fourteen things and then makes eight separate calls, six of
 * them deliberately allowed to fail without losing the booking. That design is
 * right — an operator who has taken a deposit must not lose the booking because
 * a contract would not draft — but it means a field can stop being saved and
 * the screen still says "The booking is saved." Nothing goes red. The gap only
 * shows up later, when somebody opens the booking and the date is not on it.
 *
 * A booking for a NEW client never saved at all for some time, for exactly this
 * reason wearing a different hat: it threw, the toast said "Failed to book",
 * and the contact and package instance were already written. That one is pinned
 * in new-client-booking.test.ts. This is the other half — not "does it throw"
 * but "did what I typed actually get written down".
 *
 * So this fills in every field the way an operator would, runs the exact
 * sequence submitBooking runs, and then reads each row back out of the database
 * and looks at it. Assertions are against what was TYPED, never against what
 * the call returned, because a call returning an id proves the insert happened
 * and says nothing about what went into it.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'new-booking-saves', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'new-booking-saves', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createClient } from '@/modules/clients/domain';
import { createBooking, createContractForBooking } from '@/modules/bookings/domain';
import { createPackage, answerPackageClassifications } from '@/modules/packages/domain';
import { createInvoiceForBooking } from '@/modules/finances/invoices';
import { createTransaction, settleTransaction } from '@/modules/finances/domain';
import { addToBookingTeam } from '@/modules/production/domain';
import { seedStudio, seedRow } from './seed';
import { PURGE_ORDER } from './purge';

/** Exactly what an operator types into the form. Asserted against, verbatim. */
const TYPED = {
  clientName: 'Adaeze Okonkwo',
  brief: 'Two hours at the house, then the reception hall.',
  scheduledFor: '2026-11-14T09:30:00.000Z',
  linePrice: 250_000,
  discount: { kind: 'percentage' as const, value: 10 },
  paidNow: 90_000,
  paidLabel: 'Deposit on booking',
  agreementText: 'Balance due seven days before the shoot. Rescheduling once is free.',
};

let ctx: {
  contactId: string;
  bookingId: string;
  instanceId: string;
  invoiceId: string;
  valueId: string;
  employeeId: string;
  roleId: string;
  serviceId: string;
  currency: string;
};

describe('everything typed into the new booking form', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Saves Studio' });

    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'Photography' }, 'the service domain');
    const dimension = await seedRow('dimensions',
      { organization_id: TEST_ORG_ID, service_domain_id: domain.id, name: 'Occasion' }, 'the classification');
    const value = await seedRow('dimension_values',
      { organization_id: TEST_ORG_ID, dimension_id: dimension.id, name: 'Wedding' }, 'the classification value');
    const role = await seedRow('roles',
      { organization_id: TEST_ORG_ID, name: 'Photographer' }, 'the role');
    // An employee IS a contact in the role of working, exactly as a client is a
    // contact in the role of buying. There is no employees.name to write to.
    const staffContact = await seedRow('contacts',
      { organization_id: TEST_ORG_ID, display_name: 'Chidi Eze' }, 'the employee’s contact');
    const employee = await seedRow('employees',
      { organization_id: TEST_ORG_ID, contact_id: staffContact.id, status: 'active' }, 'the employee');

    // The package bundles something, because a classification is recorded
    // against the BUNDLE ROW rather than against the package itself — see the
    // silent-drop test at the bottom of this file.
    const service = await seedRow('services',
      { organization_id: TEST_ORG_ID, name: 'Wedding Coverage', service_domain_id: domain.id },
      'the service');

    const { data: org } = await supabaseAdmin
      .from('organizations').select('currency').eq('id', TEST_ORG_ID).maybeSingle();

    ctx = {
      valueId: value.id, roleId: role.id, employeeId: employee.id, serviceId: service.id,
      currency: (org as any)?.currency || 'NGN',
      contactId: '', bookingId: '', instanceId: '', invoiceId: '',
    };

    // --- the exact sequence submitBooking runs, in its order -----------------

    // 1. A client who did not exist a moment ago. The CONTACT id is the one the
    //    booking wants; taking the client id is what broke this for weeks.
    const made = await createClient({
      name: TYPED.clientName,
      email: `adaeze+${randomUUID().slice(0, 8)}@example.com`,
      phone: '+2348012345678',
    });
    ctx.contactId = made.contactId;

    // 2. The booking's own instance of the package, priced as agreed.
    const { packageId } = await createPackage({
      name: 'Wedding Day Coverage',
      instanceOf: true,
      serviceIds: [ctx.serviceId],
      price: { amount: TYPED.linePrice, currency: ctx.currency },
    });
    ctx.instanceId = packageId;

    // 3. Narrowed to what the caller said it is for.
    await answerPackageClassifications({ packageId, valueIds: [ctx.valueId] });

    // 4. The booking itself.
    const { bookingId } = await createBooking({
      contactId: ctx.contactId,
      lines: [{ packageId, linePrice: { amount: TYPED.linePrice, currency: ctx.currency } }],
      scheduledFor: TYPED.scheduledFor,
      brief: TYPED.brief,
    });
    ctx.bookingId = bookingId;

    // 5. The invoice, with the concession as it was spoken.
    const { invoiceId } = await createInvoiceForBooking({
      bookingId, dueAt: null, percentage: null, label: null, discount: TYPED.discount,
    } as any);
    ctx.invoiceId = invoiceId;

    // 6. What was actually handed over at the time.
    const tx: any = await createTransaction({
      kind: 'charge', type: TYPED.paidLabel, amount: TYPED.paidNow,
      currency: ctx.currency, invoiceId, contactId: ctx.contactId, bookingId,
    });
    await settleTransaction({ transactionId: tx.id });

    // 7. Who is on it.
    await addToBookingTeam({ bookingId, employeeId: ctx.employeeId, roleId: ctx.roleId });

    // 8. The words that were agreed.
    await createContractForBooking(bookingId, {
      depositPercentage: null, agreementText: TYPED.agreementText,
    });
  }, 180000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('puts the client, the date and the brief on the booking', async () => {
    const { data: booking } = await supabaseAdmin
      .from('bookings').select('contact_id, scheduled_for, brief, stage_id, title')
      .eq('id', ctx.bookingId).maybeSingle();

    expect(booking, 'the booking is not in the database').toBeTruthy();
    expect(booking!.contact_id, 'the client did not go on the booking').toBe(ctx.contactId);
    expect(booking!.brief, 'the brief was not saved').toBe(TYPED.brief);
    // Compared as instants. The column is a timestamptz and the form sends an
    // ISO string, so a string comparison would fail on formatting alone and
    // prove nothing either way.
    expect(new Date(booking!.scheduled_for as string).toISOString(),
      'the date and time were not saved').toBe(TYPED.scheduledFor);
    expect(booking!.stage_id, 'the booking landed on no stage').toBeTruthy();
    // Composed from what is known — it must at least carry the client's name.
    expect(booking!.title, 'the booking was named after nothing').toContain('Adaeze');
  });

  it('keeps the agreed price on the line and on the booking’s own package', async () => {
    const { data: lines } = await supabaseAdmin
      .from('booking_lines').select('package_id, price').eq('booking_id', ctx.bookingId);

    expect(lines?.length, 'the package did not go on the booking').toBe(1);
    expect(lines![0].package_id, 'the line points at the catalogue package, not the instance')
      .toBe(ctx.instanceId);
    expect((lines![0].price as any)?.amount, 'the price typed on the line was not saved')
      .toBe(TYPED.linePrice);

    // The instance carries it too, because the instance is what every later
    // read — the invoice above all — asks for the price.
    const { data: pkg } = await supabaseAdmin
      .from('packages').select('price, instance_of').eq('id', ctx.instanceId).maybeSingle();
    expect((pkg!.price as any)?.amount, 'the price did not go onto the booking’s own package')
      .toBe(TYPED.linePrice);
  });

  it('classifies the booking’s package by what the caller said it is for', async () => {
    /*
     * NOT ON THE PACKAGE. On the package's BUNDLE ROWS.
     *
     * A package cannot tag itself — a classification narrows a service, and
     * what a package owns is the join between itself and the services it
     * bundles. So "this booking is for a Wedding" is recorded once per bundled
     * service, on package_service_dimension_values.
     */
    const { data: rows } = await supabaseAdmin
      .from('package_services').select('id').eq('package_id', ctx.instanceId);
    expect(rows?.length, 'the instance bundles nothing, so nothing could be classified')
      .toBeGreaterThan(0);

    const { data: applied } = await supabaseAdmin
      .from('package_service_dimension_values').select('dimension_value_id')
      .in('package_service_id', (rows || []).map((r: any) => r.id));

    const ids = (applied || []).map((r: any) => r.dimension_value_id);
    expect(ids, 'the classification chosen at booking time was not applied').toContain(ctx.valueId);
  });

  it('records the discount as it was spoken, and what it came to', async () => {
    const { data: invoice } = await supabaseAdmin
      .from('invoices').select('discount_kind, discount_value, discount_amount')
      .eq('id', ctx.invoiceId).maybeSingle();

    expect(invoice, 'the invoice is not in the database').toBeTruthy();
    // As spoken: a percentage off, not the money it worked out to. The money is
    // frozen beside it so the document cannot drift, but the concession itself
    // is recorded the way it was agreed.
    expect(invoice!.discount_kind, 'the kind of discount was not saved').toBe('percentage');
    expect(Number(invoice!.discount_value), 'the discount as typed was not saved').toBe(10);
    expect(Number(invoice!.discount_amount), '10% of 250,000 was not worked out and frozen')
      .toBe(25_000);

    /*
     * There is no invoices.total, and that is deliberate — the total is the
     * lines less the discount plus the tax, derived on read so a stored figure
     * can never disagree with the lines under it. So what is checked here is
     * that the work was billed at full price and the concession recorded
     * against it, which is what 225,000 is made of.
     */
    const { data: invLines } = await supabaseAdmin
      .from('invoice_lines').select('amount').eq('invoice_id', ctx.invoiceId);
    const billed = (invLines || []).reduce((n: number, l: any) => n + Number(l.amount), 0);
    expect(billed, 'the booking’s line was not billed on the invoice').toBe(TYPED.linePrice);
    expect(billed - Number(invoice!.discount_amount),
      'the discount does not come off what was billed').toBe(225_000);
  });

  it('records the money actually taken, against the invoice it pays', async () => {
    const { data: txs } = await supabaseAdmin
      .from('financial_transactions')
      .select('amount, type, status, invoice_id, booking_id, contact_id')
      .eq('booking_id', ctx.bookingId);

    expect(txs?.length, 'the payment taken at booking time was not recorded').toBe(1);
    const tx = txs![0];
    expect(Number(tx.amount), 'the amount taken was not saved').toBe(TYPED.paidNow);
    expect(tx.type, 'what the payment was called was not saved').toBe(TYPED.paidLabel);
    expect(tx.invoice_id, 'the payment is not attached to the invoice it pays').toBe(ctx.invoiceId);
    expect(tx.contact_id, 'the payment is not attached to the client').toBe(ctx.contactId);
    // Settled, so that outstanding can be derived from the payments themselves
    // rather than declared by a second number that could disagree.
    expect(tx.status, 'the payment was recorded but never settled').toBe('settled');
  });

  it('puts the chosen person on the booking in their role', async () => {
    const { data: team } = await supabaseAdmin
      .from('assignments').select('employee_id, role_id').eq('booking_id', ctx.bookingId);

    const mine = (team || []).filter((a: any) => a.employee_id === ctx.employeeId);
    expect(mine.length, 'the person chosen for the role did not go on the booking')
      .toBeGreaterThan(0);
    expect(mine.some((a: any) => a.role_id === ctx.roleId),
      'they went on the booking but not in the role they were chosen for').toBe(true);
  });

  it('saves the contract as the words that were typed', async () => {
    const { data: contract } = await supabaseAdmin
      .from('contracts').select('terms, contact_id').eq('booking_id', ctx.bookingId).maybeSingle();

    expect(contract, 'no contract was drafted').toBeTruthy();
    const terms = contract!.terms as any;
    // The whole point of the contract rework: a contract is a document of
    // terms, and the terms are the words. If this ever comes back as the old
    // {base_price, deposit_percentage} with no wording, the document has gone
    // back to being a payment slip.
    expect(terms?.agreement_text, 'the typed agreement is not in the contract')
      .toBe(TYPED.agreementText);
    expect(contract!.contact_id, 'the contract is not against the client').toBe(ctx.contactId);
    // The figures snapshotted beside the words, so the document cannot drift
    // when the booking changes afterwards.
    expect(Number(terms?.base_price), 'the contract did not snapshot what was agreed')
      .toBe(TYPED.linePrice);
    expect(terms?.line_items?.[0]?.title, 'the contract states no scope')
      .toBeTruthy();
  });

/*
 * A CLASSIFICATION WITH NOWHERE TO GO SAYS SO.
 *
 * A classification narrows a SERVICE, and what a package owns is its join to
 * the services it bundles — so a package bundling nothing has no row to carry
 * one. This used to answer { ok: true } and write nothing, which made the
 * form's whole reporting channel unreachable: submitBooking gathers
 * classificationProblems and raises them once the booking lands, and it was fed
 * only by a catch. Nothing threw. The operator picked Wedding, was told "The
 * booking is saved", and the booking was not for a wedding.
 *
 * Not a throw, because the storefront calls this before creating the booking
 * and does not catch — a client choosing an occasion for an unbundled package
 * would lose the whole job over an annotation.
 */
  it('reports a classification it had nowhere to put, instead of claiming success', async () => {
    const { packageId } = await createPackage({
      name: 'Bundles Nothing',
      instanceOf: true,
      price: { amount: 10_000, currency: ctx.currency },
    });

    const { data: rows } = await supabaseAdmin
      .from('package_services').select('id').eq('package_id', packageId);
    expect(rows?.length, 'this package was supposed to bundle nothing').toBe(0);

    const said: any = await answerPackageClassifications({ packageId, valueIds: [ctx.valueId] });
    expect(said.ok, 'it still claims success while writing nothing').toBe(false);
    expect(said.recorded, 'it claims to have written something').toBe(0);
    expect(said.reason, 'it fails without saying why, so the form cannot report it')
      .toMatch(/bundle/i);

    // Still nothing written — the point is that it is now SAID, not that it
    // started working. There is nowhere for it to go.
    const { data: applied } = await supabaseAdmin
      .from('package_service_dimension_values')
      .select('dimension_value_id')
      .eq('organization_id', TEST_ORG_ID);
    expect((applied || []).filter((r: any) => r.dimension_value_id === ctx.valueId).length,
      'only the seeded booking should carry this value').toBe(1);
  }, 90000);

  it('does not claim success for values belonging to another studio', async () => {
    const { packageId } = await createPackage({
      name: 'Real Bundle', instanceOf: true, serviceIds: [ctx.serviceId],
      price: { amount: 10_000, currency: ctx.currency },
    });
    // A value id that is not this studio's. The old code absorbed this too.
    const said: any = await answerPackageClassifications({ packageId, valueIds: [randomUUID()] });
    expect(said.ok, 'an unknown classification value was accepted as recorded').toBe(false);
    expect(said.recorded).toBe(0);
  }, 90000);

  it('says how many narrowings it actually wrote', async () => {
    const { packageId } = await createPackage({
      name: 'Counted', instanceOf: true, serviceIds: [ctx.serviceId],
      price: { amount: 10_000, currency: ctx.currency },
    });
    const said: any = await answerPackageClassifications({ packageId, valueIds: [ctx.valueId] });
    expect(said.ok).toBe(true);
    // One bundled service, one value — the count is the thing a caller can
    // check, so it has to be real rather than a constant.
    expect(said.recorded, 'the count of what was written is not real').toBe(1);
  }, 90000);
});
