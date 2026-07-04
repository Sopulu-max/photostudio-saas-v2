import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Client helpers
// ---------------------------------------------------------------------------

function adminClient(): SupabaseClient {
  return createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SERVICE_KEY!
  );
}

// The anon client is completely unauthenticated (role=anon, no org_id in JWT).
function anonClient(): SupabaseClient {
  return createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!
  );
}

const SEED_ORG_ID = '11111111-2222-3333-4444-555555555555';
let admin: SupabaseClient;

beforeAll(async () => {
  admin = adminClient();
  // Ensure the seed org exists for testing
  await admin.from('organizations').upsert(
    { id: SEED_ORG_ID, name: 'RLS Seed Org', status: 'active' }, 
    { onConflict: 'id' }
  );
});

describe('RLS Gate — Claimless Access', () => {
  it('denies read access to service_instances for unauthenticated requests', async () => {
    // 1. First inject a real instance via admin
    const { data: service } = await admin.from('services').upsert({
      id: `33333333-3333-3333-3333-333333333333`,
      organization_id: SEED_ORG_ID,
      name: 'RLS Test Service',
      status: 'active'
    }).select('id').single();

    const { data: cust } = await admin.from('customers').insert({
      organization_id: SEED_ORG_ID,
      primary_identifier: '+rls-read-test',
      status: 'active'
    }).select('id').single();

    const { data: agr } = await admin.from('agreements').insert({
      organization_id: SEED_ORG_ID,
      customer_id: cust!.id,
      status: 'proposed'
    }).select('id').single();

    const { data: inst } = await admin.from('service_instances').insert({
      organization_id: SEED_ORG_ID,
      agreement_id: agr!.id,
      service_id: service!.id,
      status: 'created'
    }).select('id').single();

    // 2. Attempt to read it via anon client
    const anon = anonClient();
    const { data, error } = await anon.from('service_instances').select('*').eq('id', inst!.id);
    
    // RLS "hides" rows, so error is null but data is empty
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('denies write access (inserts) for unauthenticated requests', async () => {
    const anon = anonClient();
    const { error } = await anon.from('customers').insert({
      organization_id: SEED_ORG_ID,
      primary_identifier: '+rls-write-test',
      status: 'active'
    });
    
    expect(error).toBeDefined();
    // PostgREST typically returns 401 Unauthorized or 403 Forbidden for RLS violations
    expect(error?.code).toBe('42501'); // insufficient_privilege or RLS violation
  });
});
