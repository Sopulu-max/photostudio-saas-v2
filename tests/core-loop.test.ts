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
import { createBookingFromIntake, createBooking, setBookingClient, addBookingLine, createContractForBooking, addInvoiceToBooking, startWorkForLine, getBooking, getLineConfiguration, setLineConfiguration } from '@/modules/bookings/domain';
import { createClient } from '@/modules/clients/domain';

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
  // contract it settles, so contracts cannot go first.
  'financial_transactions', 'deliveries', 'contracts',
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
  }, 30000);

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
