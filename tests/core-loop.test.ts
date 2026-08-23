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
import { createRole, addEmployee } from '@/modules/team/domain';
import { createServiceDomain, createDeliverable, createService, updateService, getService, listServiceDomains, createBlueprint, setServiceVariables, listServiceVariables } from '@/modules/services/domain';
import { listDimensionsForDomain, setValueParent, renameDimension } from '@/modules/services/dimensionsAdmin';
import { listBookingsForDimensionValue } from '@/modules/bookings/domain';
import { listValueEntries, whatCarries, whatCoOccursWith } from '@/modules/services/traversal';
import { formatVariableValue } from '@/modules/services/variableTypes';
import { getTemplate } from '@/modules/services/templates';
import { createPackage, updatePackage, getPackage, getPackageForBooking, getOpenVariablesForPackage, listPackagesForService, setPackageStatus } from '@/modules/packages/domain';
import { formatDeliverable } from '@/modules/packages/deliverableSpec';
import { parseVariableValue } from '@/modules/services/variableTypes';
import { buildVariableSuggestions } from '@/modules/services/suggestions';
import { createBookingFromIntake, createBooking, setBookingClient, addBookingLine, createContractForBooking, startWorkForLine, getStaffingNeedsForBooking, getBooking, getLineConfiguration, setLineConfiguration, updateBookingRecord } from '@/modules/bookings/domain';
import { createClient } from '@/modules/clients/domain';
import { getAttendanceToday, checkIn, checkOut, listAttendanceForEmployee, setStudioTimezone, setWorkingDays, setWeeklyHours, addHoursException } from '@/modules/team/attendance';
import { createDelivery, setDeliveryFulfils, getFulfilmentForBooking, shareDelivery, registerFile } from '@/modules/delivery/domain';
import { listNotifications, markNotificationsSeen } from '@/kernel/notifications';
import { assignTask, listCrewForBooking } from '@/modules/production/domain';
import { createTransaction, settleTransaction, voidTransaction, getMoneyTotals } from '@/modules/finances/domain';
import { createInvoiceForBooking, issueInvoice, voidInvoice, updateDraftInvoice, getInvoice } from '@/modules/finances/invoices';
import { totalsByCurrency } from '@/modules/finances/money';
import { buildServiceSuggestions, buildDimensionSuggestions, narrowFor } from '@/modules/services/suggestions';

import { PURGE_ORDER } from './purge';
export { PURGE_ORDER };

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

    // An output type is a KIND this domain can produce, so it is created
    // under one — Photography's "Edited Photos" is not Printing's.
    const { serviceDomainId: photographyId } = await createServiceDomain('Photography');
    const { outputTypeId } = await createDeliverable({ serviceDomainId: photographyId, name: 'Edited Photos' });
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
      
      
      
      durationMinutes: 60,
      serviceIds: [serviceId],
      deliverables: [{ serviceId, deliverableId: outputTypeId }],
      // The process lives here now — this is what startWorkForLine resolves.
      workflows: [{ serviceId, blueprintId }],
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

    // A booking's team is not a list anyone maintains. Giving someone a task is
    // what puts them on the booking — listCrewForBooking rolls task assignments
    // up, so there is no second act and nothing to keep in step.
    const { employeeId } = await addEmployee({ name: 'Tunde Shooter', email: 'tunde.shooter@example.com', phone: '+234 800 000 0001', role: 'Photographer' });
    await assignTask({ taskId: tasks![0].id, employeeId, roleId });

    const crew = await listCrewForBooking(bookingId);
    const tunde = crew.find((c: any) => c.employeeId === employeeId);
    expect(tunde).toBeDefined();
    expect(tunde!.name).toBe('Tunde Shooter');
    // Arrived through the work, not by being added to the booking.
    expect(tunde!.onBookingDirectly).toBe(false);
    expect(tunde!.via).toBe('Shoot');

    // And the role the blueprint asked for now reads as filled, by him.
    const staffing = await getStaffingNeedsForBooking(bookingId);
    const leadRole = staffing.roles.find((r: any) => r.roleId === roleId);
    expect(leadRole!.assigned.map((a: any) => a.name)).toContain('Tunde Shooter');

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
    // 7. FINANCES (billing the booking)
    // ---------------------------------------------------------
    // Money is raised as a document now, not as a bare row with a typed-in
    // amount — the invoice is generated from the line that was actually booked.
    const { invoiceId } = await createInvoiceForBooking({ bookingId });
    await issueInvoice({ invoiceId });
    const raised = await getInvoice(invoiceId);
    expect(raised!.number).toMatch(/^INV-\d{4}$/);
    expect(raised!.total).toBe(500);

    const finalBooking = await getBooking(bookingId);
    expect(finalBooking?.contracts.length).toBe(1);
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
  }, 120000);

  it('knows what was promised and whether it was handed over', async () => {
    const { serviceDomainId } = await createServiceDomain('Photography');
    const { outputTypeId: photosId } = await createDeliverable({ serviceDomainId, name: 'Edited Photos' });
    const { outputTypeId: albumId } = await createDeliverable({ serviceDomainId, name: 'Album' });
    const { outputTypeId: unsoldId } = await createDeliverable({ serviceDomainId, name: 'Behind the Scenes Reel' });

    const { serviceId } = await createService({ serviceDomain: 'Photography', name: 'Promised Session' });
    const { packageId } = await createPackage({
      name: 'Two-Promise Package',
      
      serviceIds: [serviceId],
      deliverables: [
        { serviceId, deliverableId: photosId },
        { serviceId, deliverableId: albumId },
      ],
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
    await updatePackage({ packageId,  });
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

  it('narrows what it knows through the domain, then the service', () => {
    // Pure: the chain is knowledge, not data, so it holds with no studio at all.
    const services = buildServiceSuggestions([]);
    expect(services['Photography']).toContain('Portrait Photography');
    expect(services['Photography']).toContain('Pet Photography');
    expect(services['Videography']).not.toContain('Portrait Photography');

    const dims = buildDimensionSuggestions([]);

    // Naming the service is what narrows: Portrait knows Client's home, Pet
    // doesn't, and neither is just "everything Photography has ever used".
    // Keyed by dimension NAME, lowercased — not by a closed five the studio
    // cannot extend. A dimension a studio invents draws on the same sources.
    expect(narrowFor(dims.context, 'Photography', 'Portrait Photography'))
      .toEqual(['In-studio', 'Outdoor', "Client's home"]);
    expect(narrowFor(dims.context, 'Photography', 'Pet Photography'))
      .toEqual(['In-studio', 'Outdoor']);
    expect(narrowFor(dims.subject, 'Photography', 'Pet Photography')).toEqual(['Pet']);

    // A service the library has never heard of still gets the domain's union
    // rather than nothing — thinner knowledge, not absent knowledge.
    const unknown = narrowFor(dims.context, 'Photography', 'Drone Photography');
    expect(unknown).toContain('In-studio');
    expect(unknown.length).toBeGreaterThan(2);

    // And a studio's own tagging teaches it about services the library lacks —
    // including under a dimension the library has never heard of either.
    const taught = buildDimensionSuggestions([
      {
        name: 'Drone Photography',
        domain: { name: 'Photography' },
        dimensions: [
          { name: 'Context', values: [{ name: 'Aerial' }] },
          { name: 'Altitude', values: [{ name: 'Rooftop' }, { name: 'High' }] },
        ],
      },
    ] as any);
    expect(narrowFor(taught.context, 'Photography', 'Drone Photography')).toEqual(['Aerial']);
    expect(narrowFor(taught.altitude, 'Photography', 'Drone Photography')).toEqual(['Rooftop', 'High']);
    expect(buildServiceSuggestions([
      { name: 'Drone Photography', domain: { name: 'Photography' } },
    ] as any)['Photography'][0]).toBe('Drone Photography');
  });

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
  }, 120000);

  it('lets a domain classify its work however it likes, and keeps it there', async () => {
    // A studio inventing a way to classify its own work, in a form field, with
    // no trip to settings. Neither the dimension nor its values exist yet.
    const { serviceId } = await createService({
      serviceDomain: 'Photography',
      name: 'Editorial Session',
      dimensions: [
        { name: 'Style', values: ['Editorial', 'Documentary'] },
        { name: 'Occasion', values: ['Wedding'] },
      ],
    });

    const service = await getService(serviceId);
    const byName = Object.fromEntries(
      ((service as any).dimensions as { name: string; values: { name: string }[] }[])
        .map((d) => [d.name, d.values.map((v) => v.name).sort()])
    );
    expect(byName['Style']).toEqual(['Documentary', 'Editorial']);
    expect(byName['Occasion']).toEqual(['Wedding']);

    // What got typed became this domain's vocabulary — offered next time,
    // which is how the system learns from being used.
    const domains = await listServiceDomains();
    const photography = (domains as any[]).find((d) => d.name === 'Photography')!;
    const known = await listDimensionsForDomain(photography.id);
    expect(known.map((d) => d.name)).toContain('Style');

    // And it stayed inside the domain. Printing asks its own questions; a
    // vocabulary that leaked sideways is the flat model this replaced.
    const { serviceId: printId } = await createService({
      serviceDomain: 'Printing',
      name: 'Fine Art Print Run',
      dimensions: [{ name: 'Style', values: ['Matte'] }],
    });
    const printing = (await listServiceDomains() as any[]).find((d) => d.name === 'Printing')!;
    const printingStyle = (await listDimensionsForDomain(printing.id)).find((d) => d.name === 'Style')!;
    expect(printingStyle.values.map((v) => v.name)).toEqual(['Matte']);
    expect(printingStyle.id).not.toBe(known.find((d) => d.name === 'Style')!.id);

    // Re-saving replaces rather than accumulates: a value removed in the form
    // is expressed by its absence, so dropping Documentary drops it.
    await updateService({
      serviceId,
      dimensions: [{ name: 'Style', values: ['Editorial'] }],
    });
    const after = await getService(serviceId);
    const styleAfter = ((after as any).dimensions as { name: string; values: { name: string }[] }[])
      .find((d) => d.name === 'Style')!;
    expect(styleAfter.values.map((v) => v.name)).toEqual(['Editorial']);
    expect(((after as any).dimensions as any[]).find((d) => d.name === 'Occasion')).toBeUndefined();

    // The value itself survives — it belongs to the domain, not to the service
    // that happened to introduce it.
    const stillKnown = await listDimensionsForDomain(photography.id);
    expect(stillKnown.find((d) => d.name === 'Style')!.values.map((v) => v.name).sort())
      .toEqual(['Documentary', 'Editorial']);

    expect(printId).toBeDefined();
  }, 120000);

  it('reads the same edges backwards: what carries a value, and what comes with it', async () => {
    // Three services that overlap on purpose. Nothing below declares a
    // relationship between any two values — the overlap IS the relationship.
    const { serviceId: weddingShoot } = await createService({
      serviceDomain: 'Photography',
      name: 'Wedding Photography',
      dimensions: [
        { name: 'Occasion', values: ['Wedding'] },
        { name: 'Context', values: ['On-location'] },
      ],
    });
    const { serviceId: weddingFilm } = await createService({
      serviceDomain: 'Photography',
      name: 'Wedding Film',
      dimensions: [
        { name: 'Occasion', values: ['Wedding'] },
        { name: 'Context', values: ['On-location'] },
        { name: 'Subject', values: ['Person'] },
      ],
    });
    const { serviceId: passportShoot } = await createService({
      serviceDomain: 'Photography',
      name: 'Passport Photography',
      dimensions: [
        { name: 'Occasion', values: ['None'] },
        { name: 'Context', values: ['In-studio'] },
      ],
    });

    const entries = await listValueEntries();
    const wedding = entries.find((e) => e.name === 'Wedding' && e.dimensionName === 'Occasion')!;
    expect(wedding.services).toBe(2);
    expect(wedding.domainName).toBe('Photography');

    // A value nothing carries is still vocabulary — reported, not hidden.
    const unused = entries.find((e) => e.name === 'In-studio')!;
    expect(unused.services).toBe(1);

    // Backwards: what does this studio do for weddings?
    const carried = await whatCarries(wedding.id);
    expect(carried.services.map((s) => s.name).sort())
      .toEqual(['Wedding Film', 'Wedding Photography']);

    // A package that bundles a wedding service answers "what do you sell for
    // weddings" without having been tagged Wedding itself. The bundle said so.
    const { packageId } = await createPackage({
      name: 'Wedding Day Coverage',
      serviceIds: [weddingShoot, weddingFilm],
    });
    const withPackage = await whatCarries(wedding.id);
    const bundled = withPackage.packages.find((p) => p.id === packageId)!;
    expect(bundled.via).toBe('bundled');
    expect(bundled.through!.sort()).toEqual(['Wedding Film', 'Wedding Photography']);

    // Narrowing one of the bundled services to it makes the answer direct, and
    // names the service that was narrowed — the package never says it alone.
    await updatePackage({
      packageId,
      narrowings: [{ serviceId: weddingShoot, valueId: wedding.id }],
    });
    const direct = (await whatCarries(wedding.id)).packages.find((p) => p.id === packageId)!;
    expect(direct.via).toBe('direct');
    // The narrowed service, plus the other bundled one that carries Wedding
    // anyway — both true, named once each.
    expect(direct.through!.sort()).toEqual(['Wedding Film', 'Wedding Photography']);

    // A narrowing has to name a service the package bundles, and one whose
    // domain owns the value. Neither is silently dropped.
    await expect(updatePackage({
      packageId,
      narrowings: [{ serviceId: passportShoot, valueId: wedding.id }],
    })).rejects.toThrow(/does not include/i);

    // And the derived half: Wedding relates to On-location because two
    // services carry both. Nobody typed that anywhere, and nothing stores it.
    const alongside = await whatCoOccursWith(wedding.id);
    const onLocation = alongside.find((c) => c.valueName === 'On-location')!;
    expect(onLocation.dimensionName).toBe('Context');
    expect(onLocation.services).toBe(2);

    // Only one wedding service is about a Person, so it ranks below.
    const person = alongside.find((c) => c.valueName === 'Person')!;
    expect(person.services).toBe(1);
    expect(alongside.indexOf(onLocation)).toBeLessThan(alongside.indexOf(person));

    // In-studio belongs to the passport service, which is not a wedding.
    expect(alongside.find((c) => c.valueName === 'In-studio')).toBeUndefined();

    // Nothing from Wedding's own dimension: "some service is both a Wedding
    // and a None" is a fact about that service, not a relationship.
    expect(alongside.some((c) => c.dimensionName === 'Occasion')).toBe(false);
  }, 120000);

  it('makes a beach shoot an outdoor shoot without tagging it twice', async () => {
    const { serviceId: beachShoot } = await createService({
      serviceDomain: 'Photography',
      name: 'Beach Portraits',
      dimensions: [
        { name: 'Setting', values: ['Beach'] },
        { name: 'Occasion', values: ['Engagement'] },
      ],
    });
    await createService({
      serviceDomain: 'Photography',
      name: 'Park Portraits',
      dimensions: [{ name: 'Setting', values: ['Outdoor'] }],
    });

    const domains = await listServiceDomains();
    const photography = (domains as any[]).find((d) => d.name === 'Photography')!;
    const setting = (await listDimensionsForDomain(photography.id)).find((d) => d.name === 'Setting')!;
    const beach = setting.values.find((v) => v.name === 'Beach')!;
    const outdoor = setting.values.find((v) => v.name === 'Outdoor')!;

    // Before nesting, the two are unrelated: Outdoor knows nothing about beaches.
    expect((await whatCarries(outdoor.id)).services.map((s) => s.name)).toEqual(['Park Portraits']);

    await setValueParent({ valueId: beach.id, parentId: outdoor.id });

    // After: the beach shoot answers "what do you do outdoors", and the service
    // was never re-tagged. Where the match came from is named rather than
    // silently claimed — the service still does not say Outdoor.
    const outdoorWork = await whatCarries(outdoor.id);
    expect(outdoorWork.services.map((s) => s.name).sort()).toEqual(['Beach Portraits', 'Park Portraits']);
    expect(outdoorWork.services.find((s) => s.name === 'Beach Portraits')!.narrower).toBe('Beach');
    expect(outdoorWork.services.find((s) => s.name === 'Park Portraits')!.narrower).toBeUndefined();

    // It only rolls upward. Standing on Beach does not pick up the park work.
    expect((await whatCarries(beach.id)).services.map((s) => s.name)).toEqual(['Beach Portraits']);

    // Counts follow the same rule, and both numbers stay available: Outdoor is
    // carried by one service itself, two counting what sits inside it.
    const entries = await listValueEntries();
    const outdoorEntry = entries.find((e) => e.id === outdoor.id)!;
    expect(outdoorEntry.services).toBe(1);
    expect(outdoorEntry.servicesIncludingNarrower).toBe(2);
    expect(entries.find((e) => e.id === beach.id)!.parentId).toBe(outdoor.id);

    // Co-occurrence rolls up too, or Outdoor's neighbours would be computed
    // from services that never mention Outdoor.
    const alongside = await whatCoOccursWith(outdoor.id);
    expect(alongside.find((c) => c.valueName === 'Engagement')).toBeTruthy();
    // ...but nothing from Setting itself: Outdoor "co-occurring" with Beach is
    // just the nesting restated.
    expect(alongside.some((c) => c.dimensionName === 'Setting')).toBe(false);

    // The tree is guarded in all three ways it could stop being a tree.
    await expect(setValueParent({ valueId: outdoor.id, parentId: outdoor.id }))
      .rejects.toThrow(/inside itself/i);
    await expect(setValueParent({ valueId: outdoor.id, parentId: beach.id }))
      .rejects.toThrow(/already inside/i);
    const engagement = (await listDimensionsForDomain(photography.id))
      .find((d) => d.name === 'Occasion')!.values.find((v) => v.name === 'Engagement')!;
    await expect(setValueParent({ valueId: engagement.id, parentId: outdoor.id }))
      .rejects.toThrow(/same question/i);

    expect(beachShoot).toBeDefined();
  }, 120000);

  it('says how many, in what unit, to what spec — and only at the package', async () => {
    const { serviceDomainId } = await createServiceDomain('Photography');
    const { outputTypeId: photos } = await createDeliverable({ serviceDomainId, name: 'Edited photographs' });
    const { outputTypeId: film } = await createDeliverable({ serviceDomainId, name: 'Highlight video' });
    const { outputTypeId: print } = await createDeliverable({ serviceDomainId, name: 'Framed print' });

    const { serviceId } = await createService({ serviceDomain: 'Photography', name: 'Specific Session' });
    const { packageId } = await createPackage({
      name: 'Specific Package',
      serviceIds: [serviceId],
      deliverables: [
        { serviceId, deliverableId: photos, quantity: 6 },
        { serviceId, deliverableId: film, quantity: 30, unit: 'second' },
        { serviceId, deliverableId: print, spec: '20x30' },
      ],
    });

    const pkg = await getPackage(packageId);
    const byName = Object.fromEntries(((pkg as any).deliverables as any[]).map((d) => [d.name, d]));
    expect(Number(byName['Edited photographs'].quantity)).toBe(6);
    expect(byName['Highlight video'].unit).toBe('second');
    expect(byName['Framed print'].spec).toBe('20x30');

    // One voice everywhere. The storefront, the package page and the invoice
    // all render through this, so a client never reads the same promise twice
    // in two phrasings.
    expect(formatDeliverable({ name: 'Edited photographs', quantity: 6 })).toBe('Edited photographs × 6');
    expect(formatDeliverable({ name: 'Highlight video', quantity: 30, unit: 'second' })).toBe('30 seconds highlight video');
    expect(formatDeliverable({ name: 'Framed print', spec: '20x30' })).toBe('Framed print · 20x30');

    // Re-saving with a spec cleared removes it rather than leaving the old
    // number behind — the editor sends every field every time.
    await updatePackage({
      packageId,
      deliverables: [
        { serviceId, deliverableId: photos, quantity: 8 },
        { serviceId, deliverableId: film, quantity: null, unit: null },
        { serviceId, deliverableId: print, spec: '20x30' },
      ],
    });
    const after = await getPackage(packageId);
    const now = Object.fromEntries(((after as any).deliverables as any[]).map((d) => [d.name, d]));
    expect(Number(now['Edited photographs'].quantity)).toBe(8);
    expect(now['Highlight video'].quantity).toBeNull();
    expect(now['Highlight video'].unit).toBeNull();
  }, 120000);

  it('answers where a service is sold, from the service end', async () => {
    const { serviceId } = await createService({ serviceDomain: 'Photography', name: 'Studio Portraits' });
    const { serviceId: unsold } = await createService({ serviceDomain: 'Photography', name: 'Nobody Buys This' });

    // Not sellable until something bundles it — which had no answer anywhere
    // before, even though the packages have always said what they bundle.
    expect(await listPackagesForService(serviceId)).toEqual([]);

    const { packageId } = await createPackage({
      name: 'Portrait Session', serviceIds: [serviceId], 
    });
    await createPackage({ name: 'Portrait Deluxe', serviceIds: [serviceId] });

    const sold = await listPackagesForService(serviceId);
    expect(sold.map((p) => p.name)).toEqual(['Portrait Deluxe', 'Portrait Session']);

    // Retiring the package is not retiring the service, and the read says so
    // rather than quietly dropping it.
    await setPackageStatus({ packageId, status: 'retired' });
    expect((await listPackagesForService(serviceId)).find((p) => p.id === packageId)!.status).toBe('retired');

    // And it stays specific to the service asked about.
    expect(await listPackagesForService(unsold)).toEqual([]);
  }, 120000);

  it('crosses from the catalogue into what was actually booked', async () => {
    const { serviceId } = await createService({
      serviceDomain: 'Photography',
      name: 'Anniversary Shoot',
      dimensions: [{ name: 'Occasion', values: ['Anniversary'] }],
    });
    const { packageId } = await createPackage({
      name: 'Anniversary Package', serviceIds: [serviceId], 
    });

    const domains = await listServiceDomains();
    const photography = (domains as any[]).find((d) => d.name === 'Photography')!;
    const occasion = (await listDimensionsForDomain(photography.id)).find((d) => d.name === 'Occasion')!;
    const anniversary = occasion.values.find((v) => v.name === 'Anniversary')!;

    // Classified but not yet sold to anyone: the catalogue says what it could
    // do, and nothing has been taken on.
    expect((await listBookingsForDimensionValue(anniversary.id)).bookings).toEqual([]);

    const { contactId } = await createClient({ name: 'Anniversary Client', email: 'anniversary@example.com' });
    const { bookingId } = await createBookingFromIntake({
      organizationId: TEST_ORG_ID,
      contactId,
      clientName: 'Anniversary Client',
      packageId,
      packageName: 'Anniversary Package',
      // The intake action re-looks-up the price server-side and passes it,
      // because a chosen tier is never trusted from the browser.
      linePrice: { base_price: 40000, currency: 'NGN' },
    });

    // The booking was never tagged Anniversary. Nothing needed to be: the line
    // points at the package, the package bundles the service, the service says
    // Anniversary — the chain was already complete.
    const booked = await listBookingsForDimensionValue(anniversary.id);
    expect(booked.bookings.map((b) => b.id)).toEqual([bookingId]);
    expect(booked.bookings[0].clientName).toBe('Anniversary Client');
    expect(booked.total).toBe(40000);

    // Two lines on one booking is one job, and the money adds up.
    await addBookingLine({ bookingId, packageId, title: 'Second day', price: { base_price: 15000 } });
    const again = await listBookingsForDimensionValue(anniversary.id);
    expect(again.bookings).toHaveLength(1);
    expect(again.total).toBe(55000);

    // Read live: renaming the value re-reads the same history rather than
    // orphaning it behind a word the studio has stopped using. That is the
    // reason this is derived and not snapshotted, so it is worth pinning.
    await renameDimension({ dimensionId: occasion.id, name: 'Milestone' });
    const afterRename = await listBookingsForDimensionValue(anniversary.id);
    expect(afterRename.bookings.map((b) => b.id)).toEqual([bookingId]);
  }, 120000);

  it('lets a variable be any shape a question can be, and parses it one way', async () => {
    // A date, a multi-select and a URL — none of which a variable could be
    // while there were two registries for one concept.
    const { serviceId } = await createService({ serviceDomain: 'Photography', name: 'Shaped Session' });
    await setServiceVariables({
      serviceId,
      variables: [
        { key: 'shoot_date', label: 'Preferred date', kind: 'date' },
        { key: 'add_ons', label: 'Add-ons', kind: 'multichoice', options: ['Drone', 'Second shooter', 'Same-day edit'] },
        { key: 'moodboard', label: 'Moodboard link', kind: 'url' },
        { key: 'brief', label: 'Brief', kind: 'textarea' },
        { key: 'outfits', label: 'Number of outfits', kind: 'number', unit: 'outfit', min: 1 },
      ],
    });

    const declared = await listServiceVariables(serviceId);
    expect(declared.map((v) => v.kind)).toEqual(['date', 'multichoice', 'url', 'textarea', 'number']);
    expect(declared.find((v) => v.key === 'add_ons')!.options).toEqual(['Drone', 'Second shooter', 'Same-day edit']);

    // One parser, whichever surface the value came from. A boolean used to be
    // 'true' on the public form and 'yes' on the operator's — both land now.
    expect(parseVariableValue('boolean', 'yes')).toBe(true);
    expect(parseVariableValue('boolean', 'true')).toBe(true);
    expect(parseVariableValue('boolean', 'no')).toBe(false);
    expect(parseVariableValue('number', '6')).toBe(6);
    expect(parseVariableValue('multichoice', ['Drone', 'Same-day edit'])).toEqual(['Drone', 'Same-day edit']);

    // Unanswered is null, never a coerced zero — "not fixed" is what leaves a
    // question open for the client, so it must survive the round trip.
    expect(parseVariableValue('number', '')).toBeNull();
    expect(parseVariableValue('text', '   ')).toBeNull();
    expect(parseVariableValue('boolean', '')).toBeNull();

    // A package can fix the odd shapes too, and reads them back as written.
    const { packageId } = await createPackage({
      name: 'Shaped Package',
      serviceIds: [serviceId],
      variableValues: [
        { serviceVariableId: declared.find((v) => v.key === 'add_ons')!.id, value: ['Drone'] },
        { serviceVariableId: declared.find((v) => v.key === 'shoot_date')!.id, value: '2026-09-01' },
      ],
    });
    const pkg = await getPackage(packageId);
    const fixed = Object.fromEntries((pkg!.variableValues as any[]).map((v) => [v.key, v.value]));
    expect(fixed['add_ons']).toEqual(['Drone']);
    expect(fixed['shoot_date']).toBe('2026-09-01');

    // And the library's knowledge of what varies is finally offered: it knows
    // both the label and what it is measured in, which is one fact not two.
    const suggestions = buildVariableSuggestions([]);
    expect(narrowFor(suggestions.labels, 'Photography', 'Portrait Photography'))
      .toContain('Number of outfits');
    expect(suggestions.shapeFor['number of outfits']).toMatchObject({ kind: 'number', unit: 'outfit' });
    expect(suggestions.units).toContain('hour');

    // A studio's own services teach it too, not just the shipped library.
    const taught = buildVariableSuggestions([
      { name: 'Shaped Session', domain: { name: 'Photography' }, variables: [{ label: 'Drone passes', kind: 'number', unit: 'pass' }] },
    ] as any);
    expect(taught.shapeFor['drone passes']).toMatchObject({ unit: 'pass' });
  }, 120000);

  it('records who turned up, once a day, on the studio’s own day', async () => {
    const { employeeId } = await addEmployee({ name: 'Ada Crew', email: 'ada.crew@example.com', phone: '+234 800 000 0000' });

    // Nobody is in until somebody taps.
    const before = await getAttendanceToday();
    expect(before.roster.find((r) => r.employeeId === employeeId)!.state).toBe('away');

    await checkIn(employeeId);
    const afterIn = await getAttendanceToday();
    const person = afterIn.roster.find((r) => r.employeeId === employeeId)!;
    expect(person.state).toBe('in');
    expect(person.checkedInAt).toBeTruthy();

    // Tapping twice cannot produce two mornings — a shared device by the door
    // gets pressed twice constantly.
    const second = await checkIn(employeeId);
    expect(second.alreadyIn).toBe(true);
    expect((await listAttendanceForEmployee(employeeId)).length).toBe(1);
    const arrival = (await listAttendanceForEmployee(employeeId))[0].checkedInAt;

    await checkOut(employeeId);
    const afterOut = await getAttendanceToday();
    expect(afterOut.roster.find((r) => r.employeeId === employeeId)!.state).toBe('out');
    expect((await listAttendanceForEmployee(employeeId))[0].minutes).not.toBeNull();

    // Coming back reopens the day rather than starting a second one, and the
    // morning keeps the time they actually arrived.
    await checkIn(employeeId);
    const days = await listAttendanceForEmployee(employeeId);
    expect(days).toHaveLength(1);
    expect(days[0].checkedOutAt).toBeNull();
    expect(days[0].checkedInAt).toBe(arrival);

    // A time given with the action is what gets recorded — no second step.
    // Somebody who arrived at eight and taps at ten types eight and is done.
    await setStudioTimezone('Africa/Lagos');
    const { employeeId: late } = await addEmployee({ name: 'Ada Late', email: 'ada.late@example.com', phone: '+234 800 000 0002' });
    await checkIn(late, '08:00');
    const lateDay = (await listAttendanceForEmployee(late))[0];
    const arrivedAt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos',
    }).format(new Date(lateDay.checkedInAt));
    expect(arrivedAt).toBe('08:00');

    // Coming back must not overwrite the morning. Pressing check-in again with
    // no time reopens the day and leaves the recorded arrival where it was —
    // otherwise somebody back from lunch loses the hours already worked.
    await checkOut(late, '12:00');
    await checkIn(late);
    const reopened = (await listAttendanceForEmployee(late))[0];
    expect(reopened.checkedOutAt).toBeNull();
    expect(reopened.checkedInAt).toBe(lateDay.checkedInAt);

    // And leaving before arriving is refused rather than stored.
    await expect(checkOut(late, '06:00')).rejects.toThrow(/earlier than check-in/i);

    // You cannot leave a day you never started.
    const { employeeId: neverIn } = await addEmployee({ name: 'Never In', email: 'never.in@example.com', phone: '+234 800 000 0003' });
    await expect(checkOut(neverIn)).rejects.toThrow(/checked in/i);

    // The working day is the STUDIO's, not the server's. A studio in Lagos is
    // an hour ahead of UTC, so late evening there is already tomorrow in UTC —
    // filing that against the wrong date is the failure this guards.
    await setStudioTimezone('Africa/Lagos');
    const lagos = await getAttendanceToday();
    const expected = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    expect(lagos.workDate).toBe(expected);
    expect(lagos.timezone).toBe('Africa/Lagos');

    // And a timezone no database recognises is refused rather than stored.
    await expect(setStudioTimezone('Mars/Olympus')).rejects.toThrow(/recognise/i);
  }, 120000);

  it('tells a day off apart from being late', async () => {
    const { employeeId } = await addEmployee({ name: 'Ada Weekly', email: 'ada.weekly@example.com', phone: '+234 800 000 0004' });

    // Said nothing about their week: treated as possibly in, never as off. This
    // is the progressive-enrichment default — silence is not a claim.
    const unknown = (await getAttendanceToday()).roster.find((r) => r.employeeId === employeeId)!;
    expect(unknown.workingDays).toEqual([]);
    expect(unknown.expectedToday).toBe(true);
    expect(unknown.state).toBe('away');

    // Pin the studio's zone so "today" is a fact this test controls, then work
    // out which weekday it actually is there.
    await setStudioTimezone('Africa/Lagos');
    const { isoWeekday } = await getAttendanceToday();
    const otherDays = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== isoWeekday);

    // Working every day EXCEPT today: off, not late.
    await setWorkingDays({ employeeId, days: otherDays });
    const off = (await getAttendanceToday()).roster.find((r) => r.employeeId === employeeId)!;
    expect(off.expectedToday).toBe(false);
    expect(off.state).toBe('off');

    // Someone who comes in on their day off is HERE. The board must not argue
    // with the room.
    await checkIn(employeeId);
    const anyway = (await getAttendanceToday()).roster.find((r) => r.employeeId === employeeId)!;
    expect(anyway.state).toBe('in');
    await checkOut(employeeId);
    expect((await getAttendanceToday()).roster.find((r) => r.employeeId === employeeId)!.state).toBe('out');

    // Today included: due in, and once the record is cleared they read as away.
    await setWorkingDays({ employeeId, days: [isoWeekday] });
    const due = (await getAttendanceToday()).roster.find((r) => r.employeeId === employeeId)!;
    expect(due.expectedToday).toBe(true);
    expect(due.workingDays).toEqual([isoWeekday]);

    // Days are stored deduplicated, in week order, and nonsense is dropped
    // rather than stored — the database check would reject an 8th day anyway.
    await setWorkingDays({ employeeId, days: [6, 1, 6, 99, 0, 3] as number[] });
    expect((await getAttendanceToday()).roster.find((r) => r.employeeId === employeeId)!.workingDays)
      .toEqual([1, 3, 6]);

    // And clearing it goes back to not knowing, not to "works nothing".
    await setWorkingDays({ employeeId, days: [] });
    const cleared = (await getAttendanceToday()).roster.find((r) => r.employeeId === employeeId)!;
    expect(cleared.workingDays).toEqual([]);
    expect(cleared.expectedToday).toBe(true);
  }, 120000);


/**
 * The studio's hours, and the two things they decide.
 *
 * Kept honest against a real database because both answers are calendar
 * arithmetic resolved in Postgres — a mock would only prove the mock agrees
 * with itself.
 */
  it('studio hours: refuses a public booking outside them, and reads a wall clock as the studio meant it', async () => {
    await setStudioTimezone('Africa/Lagos');

    const contact = await createClient({ name: 'Hours Client' });
    const contactId = (contact as any).contactId ?? (contact as any).id;

    // A week the studio actually keeps: open 09:00–17:00 Monday to Friday,
    // shut at the weekend.
    await setWeeklyHours({
      days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensAt: '09:00', closesAt: '17:00' }))
        .concat([6, 7].map((weekday) => ({ weekday, closed: true }) as any)),
    });

    // 2026-08-31 is a Monday; 2026-08-30 the Sunday before it.
    const intake = (scheduledFor: string) => createBookingFromIntake({
      organizationId: TEST_ORG_ID,
      contactId,
      clientName: 'Hours Client',
      packageName: 'A shoot',
      scheduledFor,
    });

    // Shut that day — refused, and the refusal says why.
    await expect(intake('2026-08-30T10:00')).rejects.toThrow(/closed/i);
    // Open that day, but before the doors do.
    await expect(intake('2026-08-31T07:30')).rejects.toThrow(/opens at 09:00/i);
    // And after they shut.
    await expect(intake('2026-08-31T18:30')).rejects.toThrow(/closes at 17:00/i);

    // Inside the hours: accepted, and stored as the instant that reads back as
    // the time the client typed AT THE STUDIO. This is the bug that was fixed —
    // the wall clock used to be resolved in the browser's zone, so the same
    // string produced a different instant depending on where the client sat.
    const { bookingId } = await intake('2026-08-31T10:00');
    const { data: booked } = await supabaseAdmin
      .from('bookings').select('scheduled_for').eq('id', bookingId).single();
    const atStudio = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(booked!.scheduled_for as string));
    expect(atStudio).toBe('10:00');

    // A named day beats the week beneath it, and the reason reaches the client.
    await addHoursException({
      label: 'Sanitation', weekday: 6, weekOfMonth: -1, opensAt: '10:00', closesAt: '14:00',
    });
    // 2026-08-29 is the last Saturday of August. The week says closed; the rule
    // says open from ten — so nine is refused and eleven is taken.
    await expect(intake('2026-08-29T09:00')).rejects.toThrow(/opens at 10:00/i);
    const late = await intake('2026-08-29T11:00');
    expect(late.bookingId).toBeTruthy();

    // The studio's own diary is never blocked by its own hours: a Sunday shoot
    // it books itself simply stands.
    const own = await createBooking({ title: 'Sunday shoot', scheduledFor: '2026-08-30T10:00' });
    expect(own.bookingId).toBeTruthy();
  }, 120000);
});
