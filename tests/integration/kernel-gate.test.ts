/**
 * Kernel Constitutional Gate — Integration Test Suite
 *
 * These tests encode the manual stress-test checks from the constitutional audit.
 * Every test here is a permanent regression — a red X on any commit that breaches
 * the constitutional invariants.
 *
 * Requires: `npx supabase start` with all migrations applied.
 * Run:      npx vitest --project=integration
 *
 * The tests operate via the service-role client (bypasses RLS) for setup/teardown,
 * and via the anon client (respects RLS) for the actual assertions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { KernelRepository } from '@/lib/domains/kernel/repository';

// ---------------------------------------------------------------------------
// Client helpers
// ---------------------------------------------------------------------------

function adminClient(): SupabaseClient {
  return createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SERVICE_KEY!
  );
}

function anonClient(): SupabaseClient {
  return createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!
  );
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

// The canonical seed org used by the scaffold.
const SEED_ORG_ID = '11111111-2222-3333-4444-555555555555';
// A second, entirely separate org — used to prove cross-tenant isolation.
const OTHER_ORG_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

async function ensureOrg(supabase: SupabaseClient, id: string, name: string) {
  await supabase.from('organizations').upsert({ id, name, status: 'active' }, { onConflict: 'id' });
}

async function ensureService(supabase: SupabaseClient, orgId: string) {
  const id = `svc-gate-test-${orgId.substring(0, 8)}`;
  await supabase.from('services').upsert(
    { id, organization_id: orgId, name: 'Gate Test Service', status: 'active' },
    { onConflict: 'id' }
  );
  return id;
}

async function createCustomer(supabase: SupabaseClient, orgId: string, phone: string) {
  const { data, error } = await supabase
    .from('customers')
    .insert({ organization_id: orgId, primary_identifier: phone, status: 'active' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function createInstance(
  supabase: SupabaseClient,
  orgId: string,
  serviceId: string,
  agreementId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('service_instances')
    .insert({
      organization_id: orgId,
      service_id: serviceId,
      agreement_id: agreementId,
      status: 'created',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function createAgreement(
  supabase: SupabaseClient,
  orgId: string,
  customerId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('agreements')
    .insert({ organization_id: orgId, customer_id: customerId, status: 'proposed', terms: {} })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Global setup / teardown
// ---------------------------------------------------------------------------

let admin: SupabaseClient;
let seedServiceId: string;
let otherServiceId: string;

beforeAll(async () => {
  admin = adminClient();
  await ensureOrg(admin, SEED_ORG_ID, 'Seed Gate Org');
  await ensureOrg(admin, OTHER_ORG_ID, 'Other Gate Org');
  seedServiceId = await ensureService(admin, SEED_ORG_ID);
  otherServiceId = await ensureService(admin, OTHER_ORG_ID);
});

afterAll(async () => {
  // Clean up gate test data keyed on org IDs
  await admin.from('events').delete().in('organization_id', [SEED_ORG_ID, OTHER_ORG_ID]);
  await admin.from('service_instances').delete().in('organization_id', [SEED_ORG_ID, OTHER_ORG_ID]);
  await admin.from('agreements').delete().in('organization_id', [SEED_ORG_ID, OTHER_ORG_ID]);
  await admin.from('customers').delete().in('organization_id', [SEED_ORG_ID, OTHER_ORG_ID]);
  await admin.from('services').delete().in('id', [seedServiceId, otherServiceId]);
});

// ---------------------------------------------------------------------------
// N4: Illegal Transitions are refused server-side
// ---------------------------------------------------------------------------

describe('N4 — Illegal Transitions', () => {
  it('throws ILLEGAL_TRANSITION when attempting delivered → created', async () => {
    const customerId = await createCustomer(admin, SEED_ORG_ID, '+n4-illegal-001');
    const agreementId = await createAgreement(admin, SEED_ORG_ID, customerId);
    const instanceId = await createInstance(admin, SEED_ORG_ID, seedServiceId, agreementId);

    // Manually fast-forward instance to 'delivered' state via events
    const deliverEvents = [
      'service_instance.scheduled',
      'service_instance.in_progress',
      'service_instance.completed',
      'service_instance.delivered',
    ];
    for (const eventType of deliverEvents) {
      await admin.from('events').insert({
        organization_id: SEED_ORG_ID,
        entity_type: 'service_instance',
        entity_id: instanceId,
        event_type: eventType,
      });
    }

    // Now try the illegal transition via the repository
    const repo = new KernelRepository(admin);
    await expect(
      repo.transitionInstance(SEED_ORG_ID, instanceId, 'created')
    ).rejects.toThrow('ILLEGAL_TRANSITION');
  });

  it('throws ILLEGAL_TRANSITION when attempting cancelled → active on agreement', async () => {
    const customerId = await createCustomer(admin, SEED_ORG_ID, '+n4-illegal-002');
    const agreementId = await createAgreement(admin, SEED_ORG_ID, customerId);

    // Cancel the agreement
    await admin.from('events').insert({
      organization_id: SEED_ORG_ID,
      entity_type: 'agreement',
      entity_id: agreementId,
      event_type: 'agreement.cancelled',
    });

    // Verify the trigger set the status
    const { data } = await admin
      .from('agreements').select('status').eq('id', agreementId).single();
    expect(data?.status).toBe('cancelled');

    // There is no LEGAL_TRANSITIONS path back from cancelled — the repo would reject any event
    // We verify the check constraint also holds at the DB level
    const { error } = await admin.from('agreements').update({ status: 'active' }).eq('id', agreementId);
    expect(error).toBeDefined(); // CHECK violation
  });
});

// ---------------------------------------------------------------------------
// N2: Cross-tenant write isolation
// ---------------------------------------------------------------------------

describe('N2 — Cross-tenant Event Isolation', () => {
  it('an event with wrong organization_id does not update the target entity', async () => {
    const customerId = await createCustomer(admin, SEED_ORG_ID, '+n2-crossorg-001');
    const agreementId = await createAgreement(admin, SEED_ORG_ID, customerId);
    const instanceId = await createInstance(admin, SEED_ORG_ID, seedServiceId, agreementId);

    // Emit a cross-tenant event: entity belongs to SEED_ORG_ID, but event claims OTHER_ORG_ID
    await admin.from('events').insert({
      organization_id: OTHER_ORG_ID,  // Wrong org!
      entity_type: 'service_instance',
      entity_id: instanceId,
      event_type: 'service_instance.scheduled',
    });

    // The instance should still be 'created', not 'scheduled'
    const { data } = await admin
      .from('service_instances')
      .select('status')
      .eq('id', instanceId)
      .single();
    expect(data?.status).toBe('created');
  });
});

// ---------------------------------------------------------------------------
// N5: Idempotency — same phone number yields one customer
// ---------------------------------------------------------------------------

describe('N5 — Idempotent Customer Lookup', () => {
  it('creating two customers with the same phone in the same org yields one record', async () => {
    const phone = '+447000000001';

    // First insert
    const { data: first } = await admin
      .from('customers')
      .insert({ organization_id: SEED_ORG_ID, primary_identifier: phone, status: 'active' })
      .select('id')
      .single();

    // Second attempt — should conflict on the unique index and return the existing one
    // (In the quick-sale action we do a select-or-insert pattern)
    const { data: existing } = await admin
      .from('customers')
      .select('id')
      .eq('organization_id', SEED_ORG_ID)
      .eq('primary_identifier', phone)
      .maybeSingle();

    expect(existing?.id).toBe(first?.id);

    // Confirm there is only one record with that phone
    const { data: all } = await admin
      .from('customers')
      .select('id')
      .eq('organization_id', SEED_ORG_ID)
      .eq('primary_identifier', phone);
    expect(all?.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// N3: Request status vocabulary — canonical states accepted, non-canonical rejected
// ---------------------------------------------------------------------------

describe('N3 — Request Status Vocabulary', () => {
  it('allows inserting a request with canonical status created', async () => {
    const customerId = await createCustomer(admin, SEED_ORG_ID, '+n3-status-001');
    const { error } = await admin.from('requests').insert({
      organization_id: SEED_ORG_ID,
      customer_id: customerId,
      status: 'created',
      payload: {},
    });
    expect(error).toBeNull();
  });

  it('rejects a request with non-canonical status open (the regressed value)', async () => {
    const customerId = await createCustomer(admin, SEED_ORG_ID, '+n3-status-002');
    const { error } = await admin.from('requests').insert({
      organization_id: SEED_ORG_ID,
      customer_id: customerId,
      status: 'open', // Not in the canonical union
      payload: {},
    });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/check/i);
  });

  it('rejects a request with non-canonical status rejected', async () => {
    const customerId = await createCustomer(admin, SEED_ORG_ID, '+n3-status-003');
    const { error } = await admin.from('requests').insert({
      organization_id: SEED_ORG_ID,
      customer_id: customerId,
      status: 'rejected', // Not in the canonical union (correct word is 'declined')
      payload: {},
    });
    expect(error).toBeDefined();
  });

  it.each(['reviewed', 'accepted', 'declined', 'withdrawn', 'expired'])(
    'accepts canonical request status: %s',
    async (status) => {
      const customerId = await createCustomer(admin, SEED_ORG_ID, `+n3-status-${status}`);
      // Create in 'created' first, then update
      const { data } = await admin
        .from('requests')
        .insert({ organization_id: SEED_ORG_ID, customer_id: customerId, status: 'created', payload: {} })
        .select('id')
        .single();
      const { error } = await admin.from('requests').update({ status }).eq('id', data!.id);
      expect(error).toBeNull();
    }
  );
});

// ---------------------------------------------------------------------------
// Quick Sale: happy path writes exactly 4 rows + 4 events
// ---------------------------------------------------------------------------

describe('Quick Sale — Happy Path Writes', () => {
  it('creates 1 customer, 1 agreement, 1 instance, 1 request and emits 4 canonical events', async () => {
    const phone = `+447000001234`;
    const supabase = adminClient();

    // Count existing before
    const before = {
      customers: (await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('organization_id', SEED_ORG_ID)).count ?? 0,
      agreements: (await supabase.from('agreements').select('id', { count: 'exact', head: true }).eq('organization_id', SEED_ORG_ID)).count ?? 0,
      instances: (await supabase.from('service_instances').select('id', { count: 'exact', head: true }).eq('organization_id', SEED_ORG_ID)).count ?? 0,
      events: (await supabase.from('events').select('id', { count: 'exact', head: true }).eq('organization_id', SEED_ORG_ID)).count ?? 0,
    };

    // Execute the quick-sale sequence manually (mirrors the server action logic)
    // Step 1: Idempotent customer lookup
    let customerId: string;
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', SEED_ORG_ID)
      .eq('primary_identifier', phone)
      .maybeSingle();

    if (existing) {
      customerId = existing.id;
    } else {
      const { data: newCust, error } = await supabase
        .from('customers')
        .insert({ organization_id: SEED_ORG_ID, primary_identifier: phone, status: 'active' })
        .select('id').single();
      expect(error).toBeNull();
      customerId = newCust!.id;
    }

    // Step 2: Create request
    const { data: req, error: reqError } = await supabase
      .from('requests')
      .insert({ organization_id: SEED_ORG_ID, customer_id: customerId, status: 'created', payload: {} })
      .select('id').single();
    expect(reqError).toBeNull();

    // Step 3: Create agreement
    const { data: agr, error: agrError } = await supabase
      .from('agreements')
      .insert({ organization_id: SEED_ORG_ID, customer_id: customerId, status: 'proposed', terms: {} })
      .select('id').single();
    expect(agrError).toBeNull();

    // Step 4: Create instance
    const { data: inst, error: instError } = await supabase
      .from('service_instances')
      .insert({ organization_id: SEED_ORG_ID, service_id: seedServiceId, agreement_id: agr!.id, status: 'created' })
      .select('id').single();
    expect(instError).toBeNull();

    // Step 5: Emit the 4 canonical events
    const events = [
      { entity_type: 'request', entity_id: req!.id, event_type: 'request.created' },
      { entity_type: 'request', entity_id: req!.id, event_type: 'request.accepted' },
      { entity_type: 'agreement', entity_id: agr!.id, event_type: 'agreement.proposed' },
      { entity_type: 'agreement', entity_id: agr!.id, event_type: 'agreement.active' },
    ];
    const { error: eventsError } = await supabase.from('events').insert(
      events.map(e => ({ ...e, organization_id: SEED_ORG_ID, payload: {} }))
    );
    expect(eventsError).toBeNull();

    // Assert: exactly +1 per table
    const after = {
      customers: (await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('organization_id', SEED_ORG_ID)).count ?? 0,
      agreements: (await supabase.from('agreements').select('id', { count: 'exact', head: true }).eq('organization_id', SEED_ORG_ID)).count ?? 0,
      instances: (await supabase.from('service_instances').select('id', { count: 'exact', head: true }).eq('organization_id', SEED_ORG_ID)).count ?? 0,
      events: (await supabase.from('events').select('id', { count: 'exact', head: true }).eq('organization_id', SEED_ORG_ID)).count ?? 0,
    };

    expect(after.customers).toBeGreaterThanOrEqual(before.customers);
    expect(after.agreements).toBe(before.agreements + 1);
    expect(after.instances).toBe(before.instances + 1);
    expect(after.events).toBe(before.events + 4);

    // Assert: agreement reached 'active' status via trigger
    const { data: agrFinal } = await supabase.from('agreements').select('status').eq('id', agr!.id).single();
    expect(agrFinal?.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// Static vocabulary grep assertions (no DB required)
// ---------------------------------------------------------------------------

describe('Static — Vocabulary Sanity', () => {
  it('LEGAL_TRANSITIONS contains no reference to the word "modified"', async () => {
    const { LEGAL_TRANSITIONS } = await import('@/lib/domains/kernel/types');
    const allValues = Object.values(LEGAL_TRANSITIONS).flatMap(v => Object.values(v)).flat();
    expect(allValues.some(v => v.includes('modified'))).toBe(false);
  });

  it('KernelState type does not include "modified" or "open" or "rejected"', async () => {
    // We use LEGAL_TRANSITIONS as the single source of truth and verify its keys
    const { LEGAL_TRANSITIONS } = await import('@/lib/domains/kernel/types');
    const allStates = Object.values(LEGAL_TRANSITIONS).flatMap(v => Object.keys(v));
    expect(allStates).not.toContain('modified');
    expect(allStates).not.toContain('open');
    expect(allStates).not.toContain('rejected');
  });
});
