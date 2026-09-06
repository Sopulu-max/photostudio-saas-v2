import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * THE PUBLIC PATH NEVER NEEDS A SESSION.
 *
 * A stranger on a studio's booking link has no account. The organization comes
 * from the URL's slug and is passed explicitly to everything below, which is
 * why those functions carry an org id at all.
 *
 * EVERY OTHER SUITE MOCKS getAuthOrgId TO SUCCEED, so in a test there is always
 * a session and the public path is never exercised the way a client runs it.
 * That is exactly how this shipped: getPackageVariablesPublic reached
 * listServiceDeliverableOptions, which demanded a session, so opening a package
 * on the public booking page threw "No organization found. Please complete
 * studio setup at /create-studio" — at a client — and every test passed.
 *
 * So here getAuthOrgId THROWS, as it does for a stranger, and the public
 * readers have to work anyway. A new call that quietly needs a session fails
 * here rather than in front of somebody trying to book.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => {
    throw new Error('No organization found. Please complete studio setup at /create-studio');
  },
  getOptionalAuthOrgId: async () => null,
}));

import { getStudioBySlug } from '@/kernel/organizations';
import {
  getPackagePublic,
  getPackageVariablesPublic,
  getOpenVariablesForPackagePublic,
  getOpenClassificationsForPackagePublic,
  getIntakeQuestionsPublic,
  listPackagesPublic,
  listPackagesPublicWithDimensions,
  packageNarrowingValueIds,
} from '@/modules/packages/interface';
import { getPublicIntakeDimensions, premisesValueIdsFor, needsPremisesFor } from '@/modules/services/interface';
import { studioDayPublic } from '@/modules/bookings/interface';
import { seedStudio, seedRow } from './seed';
import { PURGE_ORDER } from './purge';

let packageId = '';
let slug = '';

describe('a stranger with no session', () => {
  beforeAll(async () => {
    slug = `public-${randomUUID().slice(0, 8)}`;
    // Nothing here writes through the domain, so no stages are needed — but
    // the slug is, because resolving the studio from it is half of what this
    // file exists to check.
    await seedStudio({
      orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Public Path Studio', slug, stages: false,
    });

    /*
     * Built with raw inserts rather than the domain's own creators, because
     * every one of those needs a session and this file has none. What is being
     * tested is the READING, so the writing goes round the front.
     */
    const domain = await seedRow('service_domains', { organization_id: TEST_ORG_ID, name: 'Photography' });
    const service = await seedRow('services', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id, name: 'Sitting', status: 'active',
    });
    const deliverable = await seedRow('deliverables', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id, name: 'Edited photographs',
    });
    const serviceDeliverable = await seedRow('service_deliverables', {
      organization_id: TEST_ORG_ID, service_id: service.id, deliverable_id: deliverable.id,
    });
    const pkg = await seedRow('packages', {
      organization_id: TEST_ORG_ID, name: 'A package', status: 'active',
      // Priced, because the catalogue read `pricing` — an empty legacy column
      // on every row — instead of `price`, and so told every client in every
      // studio "Custom quote" for work the studio had put a figure on.
      price: { base_price: 200000, currency: 'NGN' },
    });
    packageId = pkg.id;
    const bundle = await seedRow('package_services', {
      organization_id: TEST_ORG_ID, package_id: pkg.id, service_id: service.id, position: 0,
    });
    await seedRow('package_deliverables', {
      organization_id: TEST_ORG_ID, package_service_id: bundle.id, deliverable_id: deliverable.id, quantity: 2,
    });

    /*
     * The narrowing that caused this: a service saying which forms of its
     * deliverable it can actually produce. Reading it needed a session.
     */
    const variable = await seedRow('variables', {
      organization_id: TEST_ORG_ID, deliverable_id: deliverable.id,
      key: 'type', label: 'Type', kind: 'choice', options: ['Softcopy', 'Hardcopy'], position: 0,
    });
    await seedRow('service_deliverable_options', {
      organization_id: TEST_ORG_ID, service_deliverable_id: serviceDeliverable.id,
      variable_id: variable.id, value: 'Softcopy',
    });
  }, 180000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('proves the mock: asking for a session throws', async () => {
    const { getAuthOrgId } = await import('@/lib/supabase/getOrgId');
    await expect(getAuthOrgId()).rejects.toThrow(/No organization found/);
  }, 60000);

  it('resolves the studio from its slug', async () => {
    const org = await getStudioBySlug(slug);
    expect(org?.id, 'the slug did not resolve to the studio').toBe(TEST_ORG_ID);
  }, 60000);

  it('reads a package and everything its page needs', async () => {
    /*
     * This is the page that threw. Every one of these is called while
     * rendering /book/[slug]/[packageId] for somebody with no account.
     */
    expect((await getPackagePublic(TEST_ORG_ID, packageId))?.name).toBe('A package');
    await expect(getPackageVariablesPublic(TEST_ORG_ID, packageId)).resolves.toBeDefined();
    await expect(getOpenVariablesForPackagePublic(TEST_ORG_ID, packageId)).resolves.toBeDefined();
    await expect(getOpenClassificationsForPackagePublic(TEST_ORG_ID, packageId)).resolves.toBeDefined();
    await expect(getIntakeQuestionsPublic(packageId)).resolves.toBeDefined();
    await expect(packageNarrowingValueIds(TEST_ORG_ID, packageId)).resolves.toBeDefined();
  }, 120000);

  it('reads the catalogue a client browses', async () => {
    const listed = await listPackagesPublicWithDimensions(TEST_ORG_ID);
    expect(listed.length, 'the public catalogue came back empty').toBeGreaterThan(0);
    // What it promises, by name — what the poster cards show.
    expect((listed[0] as any).deliverables?.[0]?.name).toBe('Edited photographs');
    /*
     * AND WHAT IT COSTS.
     *
     * The figure a studio sets is the one thing a client cannot work out for
     * themselves, and it never reached this list: the page read `pricing`,
     * which is empty on every row, rather than `price`. Nothing failed — every
     * package simply said "Custom quote", in every studio, for as long as the
     * page has existed.
     */
    expect((listed[0] as any).price?.amount, 'the catalogue lost the price')
      .toBe(200000);
    await expect(listPackagesPublic(TEST_ORG_ID)).resolves.toBeDefined();
  }, 90000);

  it('reads what a package costs on its own page', async () => {
    const pkg = await getPackagePublic(TEST_ORG_ID, packageId);
    expect(pkg?.price?.amount, 'the package page lost the price').toBe(200000);
    expect(pkg?.price?.currency).toBe('NGN');
  }, 60000);

  it('reads the studio’s own vocabulary and day', async () => {
    await expect(getPublicIntakeDimensions(TEST_ORG_ID)).resolves.toBeDefined();
    await expect(premisesValueIdsFor(TEST_ORG_ID)).resolves.toBeDefined();
    await expect(needsPremisesFor(TEST_ORG_ID, [])).resolves.toBeNull();
    await expect(studioDayPublic(TEST_ORG_ID, '2026-11-20')).resolves.toBeDefined();
  }, 90000);
});
