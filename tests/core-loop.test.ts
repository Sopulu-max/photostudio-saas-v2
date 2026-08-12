import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

// 1. Mock getAuthOrgId globally before importing any domain functions
const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'test-user',
    orgId: TEST_ORG_ID,
    personId: TEST_PERSON_ID,
    contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'test-user',
    orgId: TEST_ORG_ID,
    personId: TEST_PERSON_ID,
    contactId: TEST_PERSON_ID,
  }),
}));

// Now import the domain functions
import { createRole } from '@/modules/team/domain';
import { createServiceDomain, createDeliverable, createService, createBlueprint, setServiceVariables, listServiceVariables } from '@/modules/services/domain';
import { formatVariableValue } from '@/modules/services/variableTypes';
import { getTemplate } from '@/modules/services/templates';
import { createPackage, updatePackage, getPackage, getPackageForBooking, getOpenVariablesForPackage } from '@/modules/packages/domain';
import { createBookingFromIntake, createBooking, setBookingClient, addBookingLine, createContractForBooking, addInvoiceToBooking, startWorkForLine, getBooking, getLineConfiguration, setLineConfiguration, updateBookingRecord } from '@/modules/bookings/domain';
import { createClient } from '@/modules/clients/domain';
import { createDelivery, setDeliveryFulfils, getFulfilmentForBooking, shareDelivery, registerFile } from '@/modules/delivery/domain';
import { listNotifications, markNotificationsSeen } from '@/kernel/notifications';
import { createTransaction, settleTransaction, voidTransaction, getMoneyTotals } from '@/modules/finances/domain';
import { createInvoiceForBooking, issueInvoice, voidInvoice, updateDraftInvoice, getInvoice } from '@/modules/finances/invoices';
import { totalsByCurrency } from '@/modules/finances/money';

/**
 * Remove a test organization and everything under it.
 *
 * Not every org-scoped table cascades from `organizations` — `events` and
 * `contacts` both refuse the delete, which is defensible in production (the app
 * archives studios, it never deletes them) but means a test must clean up after
 * itself explicitly. The previous cleanup ignored the delete's result, so it had
 * silently never worked and left an organization behind on every single run.
 *
 * Order is child-first. Tables that do cascade are harmless to include.
 */
export const PURGE_ORDER = [
  'events',
  'assignments', 'tasks', 'booking_line_variable_values', 'booking_lines',
  // financial_transactions before contracts: a transaction points at the
  // contract it settles, so contracts cannot go first. Invoices go after the
  // transactions that pay them for the same reason.
  'financial_transactions', 'invoice_lines', 'invoices',
  'delivery_deliverables', 'delivery_assets', 'assets', 'deliveries', 'contracts',
  'bookings',
  'package_services', 'package_deliverables', 'package_workflows', 'package_delivery_containers',
  'package_occasions', 'package_contexts', 'package_subjects', 'package_purposes', 'package_client_types',
  'package_variable_values',
  'packages',
  'service_deliverables', 'service_variables',
  'service_schema_occasions', 'service_schema_contexts', 'service_schema_subjects',
  'service_schema_purposes', 'service_schema_client_types',
  'services',
  'service_domain_deliverables', 'service_domain_occasions', 'service_domain_contexts',
  'service_domain_subjects', 'service_domain_purposes', 'service_domain_client_types',
  'blueprints',
  'employee_roles', 'employees', 'clients',
  'contacts',
  'roles', 'booking_stages', 'delivery_containers', 'deliverables', 'service_domains',
  'occasions', 'service_contexts', 'subjects', 'purposes', 'client_types',
] as const;

async function purgeOrg(orgId: string) {
  for (const table of PURGE_ORDER) {
    await supabaseAdmin.from(table).delete().eq('organization_id', orgId);
  }
  // Fail loudly: a silently dirty database is how eleven test studios
  // accumulated before anyone noticed.
  const { error } = await supabaseAdmin.from('organizations').delete().eq('id', orgId);
  if (error) throw new Error(`Test cleanup failed, database left dirty: ${error.message}`);
}

describe('Core Loop Verification', () => {
  
  beforeAll(async () => {
    // Seed the database with the test organization and a test contact to act as the studio owner.
    await supabaseAdmin.from('organizations').insert({
      id: TEST_ORG_ID,
      name: 'Automated Test Studio',
      status: 'active'
    });

    await supabaseAdmin.from('contacts').insert({
      id: TEST_PERSON_ID,
      organization_id: TEST_ORG_ID,
      display_name: 'Test Operator',
      email: 'test@example.com'
    });

    // We also need a default booking stage so bookings can land
    await supabaseAdmin.from('booking_stages').insert({
      organization_id: TEST_ORG_ID,
      name: 'Enquiry',
      kind: 'enquiry',
      position: 1,
      is_default: true
    });
  });

  // Generous timeout: the purge is ~45 sequential round trips, well past
  // vitest's 10s hook default.
  afterAll(async () => {
    await purgeOrg(TEST_ORG_ID);
  }, 120000);

  it('verifies the full interconnected core loop', async () => {
    // ---------------------------------------------------------
    // 1. TEAM & SERVICES (Studio Setup)
    // ---------------------------------------------------------
    const { roleId } = await createRole({ name: 'Lead Photographer' });
    expect(roleId).toBeDefined();

    const { blueprintId } = await createBlueprint({
      name: 'Default Portrait Workflow',
      stages: [
        { name: 'Shoot', roleName: 'Lead Photographer', frontStage: true },
        { name: 'Edit', roleName: 'Lead Photographer', frontStage: false },
      ]
    });
    expect(blueprintId).toBeDefined();

    // A Service no longer carries a blueprint. It is the transformation; the
    // process that carries it out is attached to the Package below, via
    // package_workflows. See docs/architecture/02-ONTOLOGY.md.
    const { serviceId } = await createService({
      serviceDomain: 'Photography',
      name: 'Portrait Session',
      description: 'A 1 hour portrait session',
    });
    expect(serviceId).toBeDefined();

    const { outputTypeId } = await createDeliverable('Edited Photos');
    expect(outputTypeId).toBeDefined();

    // The service declares what may vary. These are quantities, not dimensions:
    // shared vocabulary like Occasion lives elsewhere.
    await setServiceVariables({
      serviceId,
      variables: [
        { key: 'outfits', label: 'Number of outfits', kind: 'number', unit: 'outfit', min: 1, max: 10 },
        { key: 'edited_images', label: 'Edited images', kind: 'number', unit: 'image' },
      ],
    });
    const variables = await listServiceVariables(serviceId);
    expect(variables.map((v) => v.key)).toEqual(['outfits', 'edited_images']);

    // ---------------------------------------------------------
    // 2. PACKAGES (Marketing & Pricing)
    // ---------------------------------------------------------
    const { packageId } = await createPackage({
      name: 'Standard Portrait Package',
      description: 'Everything you need',
      basePrice: 500,
      paymentPolicy: 'deposit',
      depositPercentage: 50,
      durationMinutes: 60,
      serviceIds: [serviceId],
      deliverableIds: [outputTypeId],
      // The process lives here now — this is what startWorkForLine resolves.
      workflowIds: [blueprintId],
      // The package SELECTS from what the service declared. Fixing outfits but
      // not edited_images is the point: an unset variable stays open, a
      // question for the client rather than part of the offer.
      variableValues: [{ serviceVariableId: variables[0].id, value: 2 }],
    });
    expect(packageId).toBeDefined();

    // The gap this closes: "2 outfits" was previously unstorable anywhere.
    const pkg = await getPackage(packageId);
    expect(pkg?.variableValues).toHaveLength(1);
    expect(pkg?.variableValues[0]).toMatchObject({ key: 'outfits', value: 2, unit: 'outfit' });
    expect(formatVariableValue(pkg!.variableValues[0])).toBe('2 outfits');

    // And the rule that gives the schema its meaning: a package cannot invent a
    // variable belonging to a service it does not bundle.
    const { serviceId: otherServiceId } = await createService({ serviceDomain: 'Printing', name: 'Fine Art Printing' });
    await setServiceVariables({
      serviceId: otherServiceId,
      variables: [{ key: 'print_size', label: 'Print size', kind: 'choice', options: ['8x10', '16x20'] }],
    });
    const [foreignVariable] = await listServiceVariables(otherServiceId);
    await expect(
      updatePackage({ packageId, variableValues: [{ serviceVariableId: foreignVariable.id, value: '8x10' }] })
    ).rejects.toThrow(/does not include/i);

    // ---------------------------------------------------------
    // 3. BOOKINGS (Public Intake)
    // ---------------------------------------------------------
    // Simulate a public booking coming in via the storefront
    const { contactId: clientContactId } = await createClient({ name: 'Jane Doe', email: 'jane@example.com' });
    expect(clientContactId).toBeDefined();

    const { bookingId } = await createBookingFromIntake({
      organizationId: TEST_ORG_ID,
      contactId: clientContactId,
      clientName: 'Jane Doe',
      packageId,
      packageName: 'Standard Portrait Package',
      linePrice: { currency: 'USD', base_price: 500 }
    });
    expect(bookingId).toBeDefined();

    // ---------------------------------------------------------
    // 4. BOOKINGS (Internal Verification)
    // ---------------------------------------------------------
    const booking = await getBooking(bookingId);
    expect(booking).toBeDefined();
    expect(booking?.contact?.display_name).toBe('Jane Doe');
    expect(booking?.lines.length).toBe(1);
    expect(booking?.lines[0].title).toBe('Standard Portrait Package');

    const lineId = booking?.lines[0].id;

    // ---------------------------------------------------------
    // 5. PRODUCTION (Work Seeding)
    // ---------------------------------------------------------
    // Start work on the line. Bookings asks Packages for the plan; Packages
    // assembles it from its own package_workflows (plus any extra_stages) and
    // hands the stages to Production, which seeds the tasks. Two tasks here
    // proves the whole chain resolved, including the role routing below.
    const { taskCount } = await startWorkForLine({ bookingId, lineId });
    expect(taskCount).toBe(2); // Shoot and Edit

    const { data: tasks } = await supabaseAdmin.from('tasks').select('*').eq('booking_line_id', lineId).order('stage_order');
    expect(tasks?.length).toBe(2);
    expect(tasks?.[0].stage_name).toBe('Shoot');
    expect(tasks?.[0].suggested_role_id).toBe(roleId);
    expect(tasks?.[1].stage_name).toBe('Edit');

    // ---------------------------------------------------------
    // 6. CONTRACTS (Drafting)
    // ---------------------------------------------------------
    const { contractId } = await createContractForBooking(bookingId);
    expect(contractId).toBeDefined();

    const { data: contract } = await supabaseAdmin.from('contracts').select('*').eq('id', contractId).single();
    expect(contract?.status).toBe('proposed');
    expect(contract?.terms.base_price).toBe(500);
    // 50-50 policy = 50% deposit
    expect(contract?.terms.deposit_percentage).toBe(50); 
    
    // ---------------------------------------------------------
    // 7. FINANCES (Invoicing)
    // ---------------------------------------------------------
    const { transactionId } = await addInvoiceToBooking({
      bookingId,
      label: 'Deposit',
      amount: 250,
      currency: 'USD'
    });
    expect(transactionId).toBeDefined();

    const finalBooking = await getBooking(bookingId);
    expect(finalBooking?.contracts.length).toBe(1);
    expect(finalBooking?.transactions.length).toBe(1);
  }, 120000);

  it('carries a configuration from service to package to booking', async () => {
    const { serviceId } = await createService({ serviceDomain: 'Photography', name: 'Configured Session' });
    await setServiceVariables({
      serviceId,
      variables: [
        { key: 'outfits', label: 'Number of outfits', kind: 'number', unit: 'outfit', min: 1 },
        { key: 'hours', label: 'Hours of coverage', kind: 'number', unit: 'hour', min: 1 },
      ],
    });
    const [outfits, hours] = await listServiceVariables(serviceId);

    // The package fixes one and deliberately leaves the other open.
    const { packageId } = await createPackage({
      name: 'Half-fixed Package',
      basePrice: 300,
      serviceIds: [serviceId],
      variableValues: [{ serviceVariableId: outfits.id, value: 2 }],
    });

    const open = await getOpenVariablesForPackage(packageId);
    expect(open.map((v: any) => v.key)).toEqual(['hours']);

    // A client books it and answers what was left open.
    const { contactId } = await createClient({ name: 'Ada Config', email: 'ada.config@example.com' });
    const { bookingId } = await createBookingFromIntake({
      organizationId: TEST_ORG_ID,
      contactId,
      clientName: 'Ada Config',
      packageId,
      packageName: 'Half-fixed Package',
      variableAnswers: [{ serviceVariableId: hours.id, value: 6 }],
    });

    const booking = await getBooking(bookingId);
    const config = await getLineConfiguration(booking!.lines[0].id);

    // The line now knows both halves, and where each came from.
    expect(config).toHaveLength(2);
    expect(config.find((c) => c.key === 'outfits')).toMatchObject({ value: 2, source: 'package' });
    expect(config.find((c) => c.key === 'hours')).toMatchObject({ value: 6, source: 'client' });

    // The package's scope is a snapshot: re-scoping it later must not rewrite
    // what this client already agreed to.
    await updatePackage({ packageId, variableValues: [{ serviceVariableId: outfits.id, value: 5 }] });
    const after = await getLineConfiguration(booking!.lines[0].id);
    expect(after.find((c) => c.key === 'outfits')?.value).toBe(2);

    // And the snapshot survives being touched. The client emails asking for 8
    // hours instead of 6; the operator records it. Rewriting the line must not
    // be an opportunity for the re-scoped package to leak back in.
    await setLineConfiguration({
      bookingId,
      lineId: booking!.lines[0].id,
      answers: [{ serviceVariableId: hours.id, value: 8 }],
      source: 'studio',
    });
    const edited = await getLineConfiguration(booking!.lines[0].id);
    expect(edited.find((c) => c.key === 'hours')).toMatchObject({ value: 8, source: 'studio' });
    expect(edited.find((c) => c.key === 'outfits')?.value).toBe(2);
  }, 30000);

  it('knows what was promised and whether it was handed over', async () => {
    const { outputTypeId: photosId } = await createDeliverable('Edited Photos');
    const { outputTypeId: albumId } = await createDeliverable('Album');
    const { outputTypeId: unsoldId } = await createDeliverable('Behind the Scenes Reel');

    const { serviceId } = await createService({ serviceDomain: 'Photography', name: 'Promised Session' });
    const { packageId } = await createPackage({
      name: 'Two-Promise Package',
      basePrice: 900,
      serviceIds: [serviceId],
      deliverableIds: [photosId, albumId],
    });

    const { contactId } = await createClient({ name: 'Ada Promise', email: 'ada.promise@example.com' });
    const { bookingId } = await createBookingFromIntake({
      organizationId: TEST_ORG_ID,
      contactId,
      clientName: 'Ada Promise',
      packageId,
      packageName: 'Two-Promise Package',
    });

    // Nothing handed over yet: both promises are outstanding.
    let fulfilment = await getFulfilmentForBooking(bookingId);
    expect(fulfilment.map((f) => f.name).sort()).toEqual(['Album', 'Edited Photos']);
    expect(fulfilment.every((f) => !f.covered && !f.shared)).toBe(true);

    const { deliveryId } = await createDelivery({ bookingId, title: 'Final gallery' });

    // A delivery can only claim what the booking actually sold.
    await expect(
      setDeliveryFulfils({ deliveryId, bookingId, deliverableIds: [unsoldId] })
    ).rejects.toThrow(/not part of what this booking promised/);

    await setDeliveryFulfils({ deliveryId, bookingId, deliverableIds: [photosId] });

    // Bundled is not delivered — the client still can't reach it.
    fulfilment = await getFulfilmentForBooking(bookingId);
    const photos = fulfilment.find((f) => f.name === 'Edited Photos')!;
    expect(photos.covered).toBe(true);
    expect(photos.shared).toBe(false);
    expect(fulfilment.find((f) => f.name === 'Album')!.covered).toBe(false);

    // The delivery covers exactly one promise, so its files know their type.
    await registerFile({
      deliveryId,
      bookingId,
      storagePath: `${TEST_ORG_ID}/${deliveryId}/test-file.jpg`,
      fileName: 'test-file.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });
    const { data: assetRows } = await supabaseAdmin
      .from('assets').select('deliverable_id').eq('organization_id', TEST_ORG_ID);
    expect(assetRows?.[0]?.deliverable_id).toBe(photosId);

    await shareDelivery({ deliveryId, bookingId });

    fulfilment = await getFulfilmentForBooking(bookingId);
    expect(fulfilment.find((f) => f.name === 'Edited Photos')!.shared).toBe(true);
    expect(fulfilment.find((f) => f.name === 'Album')!.shared).toBe(false);
  }, 120000);

  it('bills what was booked, and freezes it once sent', async () => {
    const { serviceId } = await createService({ serviceDomain: 'Photography', name: 'Billable Session' });
    await setServiceVariables({
      serviceId,
      variables: [{ key: 'outfits', label: 'Outfits', kind: 'number', unit: 'outfit', min: 1 }],
    });
    const [outfits] = await listServiceVariables(serviceId);
    const { packageId } = await createPackage({
      name: 'Billable Package',
      basePrice: 120000,
      serviceIds: [serviceId],
      variableValues: [{ serviceVariableId: outfits.id, value: 2 }],
    });

    const { contactId } = await createClient({ name: 'Ada Bills', email: 'ada.bills@example.com' });
    const { bookingId } = await createBookingFromIntake({
      organizationId: TEST_ORG_ID,
      contactId,
      clientName: 'Ada Bills',
      packageId,
      packageName: 'Billable Package',
      linePrice: { base_price: 120000, currency: 'NGN' },
    });

    // The invoice is generated from the booking, not typed in.
    const { invoiceId } = await createInvoiceForBooking({ bookingId });
    let inv = await getInvoice(invoiceId);
    expect(inv!.status).toBe('draft');
    expect(inv!.number).toBeNull();
    expect(inv!.lines).toHaveLength(1);
    // The line says what was sold, configuration included.
    expect(inv!.lines[0].description).toContain('Billable Package');
    expect(inv!.lines[0].description).toContain('2 outfits');
    expect(inv!.total).toBe(120000);
    expect(inv!.outstanding).toBe(120000);
    expect(inv!.settled).toBe(false);

    // A draft is unreachable by a client — no token until it's sent.
    expect(inv!.share_token).toBeNull();

    await issueInvoice({ invoiceId });
    inv = await getInvoice(invoiceId);
    expect(inv!.status).toBe('issued');
    expect(inv!.number).toMatch(/^INV-\d{4}$/);
    expect(inv!.share_token).toBeTruthy();

    // Sent means sent: the document the client is holding stops changing.
    await expect(
      updateDraftInvoice({ invoiceId, lines: [{ description: 'Sneaky', quantity: 1, unitPrice: 1 }] })
    ).rejects.toThrow(/been sent/i);

    // Re-pricing the package afterwards must not rewrite a document already
    // issued — the same snapshot rule booking lines follow.
    await updatePackage({ packageId, basePrice: 500000 });
    expect((await getInvoice(invoiceId))!.total).toBe(120000);

    // Part payment leaves it outstanding, not paid.
    const deposit = await createTransaction({
      kind: 'charge', type: 'Deposit', amount: 50000, currency: 'NGN', invoiceId, contactId,
    });
    await settleTransaction({ transactionId: (deposit as any).id });
    inv = await getInvoice(invoiceId);
    expect(inv!.paid).toBe(50000);
    expect(inv!.outstanding).toBe(70000);
    expect(inv!.partly).toBe(true);
    expect(inv!.settled).toBe(false);

    // Money against it means it can't be quietly withdrawn.
    await expect(voidInvoice({ invoiceId })).rejects.toThrow(/refund/i);

    // Paid off, the same document now reads as a receipt.
    const balance = await createTransaction({
      kind: 'charge', type: 'Balance', amount: 70000, currency: 'NGN', invoiceId, contactId,
    });
    await settleTransaction({ transactionId: (balance as any).id });
    inv = await getInvoice(invoiceId);
    expect(inv!.paid).toBe(120000);
    expect(inv!.outstanding).toBe(0);
    expect(inv!.settled).toBe(true);

    // Every client-facing payment earns its own receipt, the moment it lands —
    // a deposit against a still-unpaid invoice included. That is what makes a
    // receipt a document about a payment rather than about an invoice.
    const { getReceiptForTransaction } = await import('@/modules/finances/domain');
    const depositReceipt: any = await getReceiptForTransaction((deposit as any).id);
    const balanceReceipt: any = await getReceiptForTransaction((balance as any).id);
    expect(depositReceipt.receipt_number).toMatch(/^RCT-\d{4}$/);
    expect(balanceReceipt.receipt_number).toMatch(/^RCT-\d{4}$/);
    expect(depositReceipt.receipt_number).not.toBe(balanceReceipt.receipt_number);
    expect(depositReceipt.receipt_token).toBeTruthy();

    // And a refund un-pays it, because paid is derived rather than a flag.
    const back = await createTransaction({
      kind: 'refund', type: 'Refund', amount: 20000, currency: 'NGN', invoiceId, contactId,
    });
    await settleTransaction({ transactionId: (back as any).id });
    inv = await getInvoice(invoiceId);
    expect(inv!.paid).toBe(100000);
    expect(inv!.settled).toBe(false);
  }, 120000);

  it('never counts what the studio spent as what it earned', () => {
    // Pure, so the arithmetic is pinned exactly rather than against whatever
    // else the suite has left in the books.
    const [ngn] = totalsByCurrency([
      { kind: 'charge',  amount: 1000, currency: 'NGN', status: 'settled' },
      { kind: 'expense', amount: 400,  currency: 'NGN', status: 'settled' },
      { kind: 'refund',  amount: 150,  currency: 'NGN', status: 'settled' },
      { kind: 'charge',  amount: 300,  currency: 'NGN', status: 'pending' },
      { kind: 'expense', amount: 900,  currency: 'NGN', status: 'pending' },
      { kind: 'charge',  amount: 999,  currency: 'NGN', status: 'voided'  },
    ], 'NGN');

    expect(ngn.earned).toBe(850);  // 1000 charged, 150 given back — the cost is not a deduction here
    expect(ngn.spent).toBe(400);   // only what actually left
    expect(ngn.owed).toBe(300);    // the unpaid charge; an unpaid cost is not owed *to* the studio
    // Voided money never happened, so it appears in none of the three.

    // Two currencies stay two answers rather than being added into a third.
    const split = totalsByCurrency([
      { kind: 'charge', amount: 100, currency: 'USD', status: 'settled' },
      { kind: 'charge', amount: 500, currency: 'NGN', status: 'settled' },
    ], 'USD');
    expect(split).toHaveLength(2);
    expect(split.map((t) => t.currency).sort()).toEqual(['NGN', 'USD']);
  });

  it('keeps the books straight through settle and void', async () => {
    const before = (await getMoneyTotals()).find((t) => t.currency === 'NGN')
      ?? { currency: 'NGN', earned: 0, spent: 0, owed: 0 };

    const charge = await createTransaction({ kind: 'charge', type: 'Extra hours', amount: 200, currency: 'NGN' });
    const cost = await createTransaction({ kind: 'expense', type: 'Equipment', amount: 80, currency: 'NGN' });

    // Direction is derived, so an expense can never be recorded as money in.
    expect((charge as any).direction).toBe('inbound');
    expect((cost as any).direction).toBe('outbound');

    // Raised and unpaid: the charge is owed, the cost is nobody's debt to us.
    const raised = (await getMoneyTotals()).find((t) => t.currency === 'NGN')!;
    expect(raised.owed).toBe(before.owed + 200);
    expect(raised.earned).toBe(before.earned);

    await settleTransaction({ transactionId: (charge as any).id });
    await settleTransaction({ transactionId: (cost as any).id });

    const settled = (await getMoneyTotals()).find((t) => t.currency === 'NGN')!;
    expect(settled.earned).toBe(before.earned + 200);
    expect(settled.spent).toBe(before.spent + 80);
    expect(settled.owed).toBe(before.owed);

    // Money that already moved is a fact — it gets refunded, not un-said.
    await expect(voidTransaction({ transactionId: (charge as any).id })).rejects.toThrow(/already moved/i);

    // But something raised in error leaves the books entirely.
    const mistake = await createTransaction({ kind: 'charge', type: 'Duplicate', amount: 5000, currency: 'NGN' });
    expect((await getMoneyTotals()).find((t) => t.currency === 'NGN')!.owed).toBe(before.owed + 5000);
    await voidTransaction({ transactionId: (mistake as any).id });
    const after = (await getMoneyTotals()).find((t) => t.currency === 'NGN')!;
    expect(after.owed).toBe(before.owed);
    await expect(settleTransaction({ transactionId: (mistake as any).id })).rejects.toThrow(/voided/i);
  }, 120000);

  it('saves the booking record in one go, and only what changed', async () => {
    const { bookingId } = await createBooking({ title: 'Untitled enquiry' });
    const { contactId } = await createClient({ name: 'Ada Record', email: 'ada.record@example.com' });
    const when = '2026-09-01T10:00:00.000Z';

    const first = await updateBookingRecord({
      bookingId, title: 'Ada — Autumn shoot', contactId, scheduledFor: when, durationMinutes: 120,
    });
    expect(first.changed.sort()).toEqual(['client', 'schedule', 'title']);

    const saved = await getBooking(bookingId);
    expect(saved?.title).toBe('Ada — Autumn shoot');
    expect(saved?.contact?.id).toBe(contactId);
    expect(saved?.duration_minutes).toBe(120);
    expect(new Date(saved!.scheduled_for!).toISOString()).toBe(when);

    // Saving the same form again must not manufacture history. The date is
    // re-sent as the column spells it, which is a different string for the
    // same instant — the comparison has to see through that.
    const again = await updateBookingRecord({
      bookingId,
      title: 'Ada — Autumn shoot',
      contactId,
      scheduledFor: saved!.scheduled_for,
      durationMinutes: 120,
    });
    expect(again.changed).toEqual([]);

    // The wrong client attached has to be undoable, not just replaceable.
    const cleared = await updateBookingRecord({ bookingId, contactId: null });
    expect(cleared.changed).toEqual(['client']);
    expect((await getBooking(bookingId))?.contact).toBeFalsy();
  }, 120000);

  it('notifies the studio about the outside world, not about itself', async () => {
    // Start from a clean watermark so this test's own events are the only
    // thing that can be unread.
    await markNotificationsSeen();

    // The operator's own doing. Actor is the test contact — i.e. "me".
    const { bookingId: myBookingId } = await createBooking({ title: 'Something I did myself' });

    // A client booking. createBookingFromIntake attributes the event to the
    // client's contact, which is what makes it news.
    const { contactId: clientContactId } = await createClient({ name: 'Ada Notify', email: 'ada.notify@example.com' });
    const { bookingId: theirBookingId } = await createBookingFromIntake({
      organizationId: TEST_ORG_ID,
      contactId: clientContactId,
      clientName: 'Ada Notify',
      packageName: 'Custom Enquiry',
    });

    const items = await listNotifications(20);
    const hrefs = items.map((n) => n.href);

    // Rule 1 + 2: their booking arrives, mine does not.
    expect(hrefs).toContain(`/bookings/${theirBookingId}`);
    expect(hrefs).not.toContain(`/bookings/${myBookingId}`);

    const theirs = items.find((n) => n.href === `/bookings/${theirBookingId}`)!;
    expect(theirs.description).toBe('Ada Notify booked');
    expect(theirs.unread).toBe(true);

    // Catalog work is activity, never a notification.
    await createService({ serviceDomain: 'Photography', name: 'Quietly Defined Service' });
    expect((await listNotifications(20)).some((n) => n.description.includes('service'))).toBe(false);

    // Looking is what clears it.
    await markNotificationsSeen();
    expect((await listNotifications(20)).every((n) => !n.unread)).toBe(true);
  }, 120000);

  it('gives a template-created service its variables without hand-entry', async () => {
    const template = getTemplate('portrait-photography')!;
    expect(template.variables?.length).toBe(3);

    const { serviceId } = await createService({
      name: template.name,
      serviceDomain: template.domain,
      deliverables: template.deliverables,
      variables: template.variables,
    });

    const declared = await listServiceVariables(serviceId);
    expect(declared.map((v) => v.key)).toEqual(['people', 'outfits', 'edited_images']);
    expect(declared.find((v) => v.key === 'outfits')).toMatchObject({ kind: 'number', unit: 'outfit', min: 1 });

    // A scope variable must not also survive as an intake question, or the
    // studio would be asked for the same number twice.
    const questionLabels = template.questions.map((q) => q.label.toLowerCase());
    for (const v of template.variables!) {
      expect(questionLabels).not.toContain(v.label.toLowerCase());
    }
  }, 30000);
});
