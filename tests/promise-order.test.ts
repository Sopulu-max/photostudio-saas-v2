import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * ONE PACKAGE, LISTED THE SAME WAY TO BOTH SIDES OF THE TRANSACTION.
 *
 * A package's promises hang off its bundle rows, so the order they come back
 * in is whatever order the join produced — and two readers of the same package
 * disagreed. Standard Event Coverage read "20 Edited photographs · 2 Edited
 * video" on the studio's own catalogue and "2 Edited video · 20 Edited
 * photographs" on the client's, for the same package, at the same moment.
 *
 * Nothing errored, and nobody would have filed it as a bug — which is exactly
 * why it needs a test rather than a screenshot. The seed below deliberately
 * inserts the two deliverables in the order that would come back WRONG, so
 * this fails if the shared comparator is ever dropped from either reader.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();
const SLUG = `promise-${randomUUID().slice(0, 8)}`;

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'promise', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'promise', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import {
  getPackage,
  getPackagePublic,
  listPackagesPublicWithDimensions,
} from '@/modules/packages/interface';
import { seedStudio, seedRow } from './seed';
import { PURGE_ORDER } from './purge';

let packageId = '';

describe('the order a package lists what it promises', () => {
  beforeAll(async () => {
    await seedStudio({
      orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Promise Studio', slug: SLUG, stages: false,
    });

    const domain = await seedRow('service_domains', { organization_id: TEST_ORG_ID, name: 'Photography' });
    const service = await seedRow('services', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id, name: 'Coverage', status: 'active',
    });

    /*
     * THE STUDIO'S OWN ORDER, and it is not alphabetical — which is the point.
     * Sorting by name would pass this test by accident, so the positions run
     * against the alphabet: the studio put video first.
     */
    const video = await seedRow('deliverables', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id, name: 'Edited video', position: 0,
    });
    const photos = await seedRow('deliverables', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id, name: 'Edited photographs', position: 1,
    });

    const pkg = await seedRow('packages', {
      organization_id: TEST_ORG_ID, name: 'Coverage package', status: 'active',
    });
    packageId = pkg.id;
    const bundle = await seedRow('package_services', {
      organization_id: TEST_ORG_ID, package_id: pkg.id, service_id: service.id, position: 0,
    });
    /* Inserted photographs FIRST, so insertion order contradicts the studio's
       order and neither reader can be right by doing nothing. */
    await seedRow('package_deliverables', {
      organization_id: TEST_ORG_ID, package_service_id: bundle.id, deliverable_id: photos.id, quantity: 20,
    });
    await seedRow('package_deliverables', {
      organization_id: TEST_ORG_ID, package_service_id: bundle.id, deliverable_id: video.id, quantity: 2,
    });
  }, 180000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('follows the studio’s own arrangement, not the join’s', async () => {
    const pkg = await getPackage(packageId);
    expect(
      ((pkg as any).deliverables || []).map((d: any) => d.name),
      'the studio’s catalogue ignored the order it arranged its deliverables in',
    ).toEqual(['Edited video', 'Edited photographs']);
  }, 90000);

  it('gives the client the same order as the studio', async () => {
    const [listed] = await listPackagesPublicWithDimensions(TEST_ORG_ID);
    const clientOrder = ((listed as any).deliverables || []).map((d: any) => d.name);

    const pkg = await getPackage(packageId);
    const studioOrder = ((pkg as any).deliverables || []).map((d: any) => d.name);

    /*
     * The assertion that matters: not what the order IS, but that one package
     * reads the same to the person selling it and the person paying.
     */
    expect(clientOrder, 'the client’s card and the studio’s disagree about one package')
      .toEqual(studioOrder);
  }, 120000);

  it('and the package’s own public page agrees too', async () => {
    const pkg = await getPackagePublic(TEST_ORG_ID, packageId);
    /* Formatted here, so the quantity leads: "2 Edited video". */
    expect(pkg?.deliverableNames).toEqual(['2 Edited video', '20 Edited photographs']);
  }, 90000);
});
