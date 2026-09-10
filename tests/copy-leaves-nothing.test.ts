import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * A COPY THAT FAILS HALFWAY LEAVES NOTHING BEHIND.
 *
 * copyPackage writes the package row first and hangs everything else off it,
 * and instantiatePackageForBooking runs BEFORE the booking exists. So a client
 * whose submission died inside the copy left an instance nothing pointed at —
 * invisible in the catalogue, because instances are filtered out of it, and
 * therefore never noticed. Temitope's 22 retries against the sessionless-copy
 * bug left 22 of them in one afternoon.
 *
 * THAT BUG IS FIXED AND THIS IS NOT ABOUT THAT BUG. A dropped connection
 * between the package insert and the last carry does exactly the same thing,
 * and this database has dropped plenty. PostgREST offers no transaction to
 * roll back, so the compensation is explicit — and a compensation nothing
 * exercises is a compensation that has never run.
 *
 * So the failure is forced. copyPackageDeliverables is made to throw, which is
 * where the real one threw, and the assertion is that the package count is
 * where it started.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'undo', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'undo', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

/*
 * Mocked at the module the copier imports it from, so the throw happens at the
 * point in copyPackage that the live failure happened at — after the package
 * row exists and after the bundle rows do.
 */
vi.mock('@/modules/deliverables/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/deliverables/domain')>();
  return {
    ...actual,
    copyPackageDeliverables: async () => {
      throw new Error('SIMULATED: the connection dropped mid-copy');
    },
  };
});

import { instantiatePackageForBooking } from '@/modules/packages/domain';
import { seedStudio, seedRow } from './seed';
import { PURGE_ORDER } from './purge';

let packageId = '';

const countPackages = async () => {
  const { count } = await supabaseAdmin
    .from('packages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', TEST_ORG_ID);
  return count ?? -1;
};

describe('a package copy that fails partway', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Undo Studio', stages: false });

    const domain = await seedRow('service_domains', { organization_id: TEST_ORG_ID, name: 'Photography' });
    const service = await seedRow('services', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id, name: 'Sitting', status: 'active',
    });
    const deliverable = await seedRow('deliverables', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id, name: 'Edited photographs',
    });
    const pkg = await seedRow('packages', {
      organization_id: TEST_ORG_ID, name: 'A sitting', status: 'active',
      price: { base_price: 50000, currency: 'NGN' },
    });
    packageId = pkg.id;
    const bundle = await seedRow('package_services', {
      organization_id: TEST_ORG_ID, package_id: pkg.id, service_id: service.id, position: 0,
    });
    /* Something for the copier to carry, so the mocked step is reached. */
    await seedRow('package_deliverables', {
      organization_id: TEST_ORG_ID, package_service_id: bundle.id,
      deliverable_id: deliverable.id, quantity: 4,
    });
  }, 180000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('reports the failure rather than swallowing it', async () => {
    await expect(
      instantiatePackageForBooking({ packageId, organizationId: TEST_ORG_ID }),
    ).rejects.toThrow();
  }, 90000);

  it('leaves no half-made instance behind', async () => {
    const before = await countPackages();

    await instantiatePackageForBooking({ packageId, organizationId: TEST_ORG_ID })
      .catch(() => null);

    /*
     * THE ASSERTION THE 22 ORPHANS WOULD HAVE FAILED. Before the compensation
     * this was before + 1 every time, and the row was invisible in the
     * catalogue, so nothing complained.
     */
    expect(await countPackages(), 'a failed copy left a package behind').toBe(before);
  }, 120000);

  it('leaves the catalogue package it was copying untouched', async () => {
    const { data } = await supabaseAdmin
      .from('packages').select('name, status, price').eq('id', packageId).single();
    /* The compensation deletes the COPY. Deleting the original instead would
       be the worst possible outcome of a tidy-up, so it is asserted. */
    expect((data as any).name).toBe('A sitting');
    expect((data as any).status).toBe('active');
    expect(Number((data as any).price?.base_price)).toBe(50000);

    const { count } = await supabaseAdmin
      .from('package_services').select('id', { count: 'exact', head: true })
      .eq('organization_id', TEST_ORG_ID).eq('package_id', packageId);
    expect(count, 'the original lost its bundle').toBe(1);
  }, 90000);
});
