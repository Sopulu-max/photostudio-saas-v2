import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * A package is sold with a set of pictures, and the cover is the first of them.
 *
 * WHAT THIS PINS. Not that a table exists — that the cover is a READING of the
 * order rather than a second fact. cover_url was its own column for as long as
 * there was one picture; now it is derived from whichever picture leads, so
 * reordering is the same act as choosing a cover and the two cannot disagree.
 * Every caller that asked for the cover still gets one — including the public
 * page, which hands it to OpenGraph, where a slideshow cannot go.
 *
 * Also pinned: that each picture keeps its own framing, because a single
 * cover_position was only ever right about one of them; that the database
 * refuses a twenty-first, because a limit that lives in one caller is a limit
 * until somebody writes a second caller; and that a package with no pictures
 * still answers "no cover" rather than throwing, because most packages start
 * with none.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'pics', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'pics', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createService } from '@/modules/services/domain';
import {
  createPackage, getPackage, listPackagesPublicWithDimensions, getPackagePublic,
  addPackageImage, removePackageImage, setPackageImagePosition, reorderPackageImages,
  type PackageImage,
} from '@/modules/packages/domain';
import { seedStudio } from './seed';
import { PURGE_ORDER } from './purge';

let serviceId = '';
let packageId = '';
const A = 'https://example.test/pictures/a.webp';
const B = 'https://example.test/pictures/b.webp';
const C = 'https://example.test/pictures/c.webp';

describe('A package is sold with pictures', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Pictures Studio', stages: false });
    const service = await createService({
      name: 'Portrait Session',
      serviceDomain: 'Photography',
      primaryDeliverable: 'Edited image',
    } as any);
    serviceId = service.serviceId;
    const made = await createPackage({ name: 'Golden Hour', serviceIds: [serviceId] });
    packageId = made.packageId;
  }, 120000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('starts with none, and says so rather than failing', async () => {
    const pkg = await getPackage(packageId);
    expect(pkg?.images, 'a new package did not come back with an empty set').toEqual([]);
    expect(pkg?.cover_url, 'a package with no pictures claimed a cover').toBeNull();
  }, 60000);

  it('the first picture added is the cover, and stays it as more arrive', async () => {
    await addPackageImage({ packageId, url: A });
    let pkg = await getPackage(packageId);
    expect(pkg?.cover_url, 'the only picture is not the cover').toBe(A);

    await addPackageImage({ packageId, url: B });
    await addPackageImage({ packageId, url: C });
    pkg = await getPackage(packageId);
    expect(pkg?.images.map((i: PackageImage) => i.url), 'pictures did not keep the order they were added in').toEqual([A, B, C]);
    expect(pkg?.cover_url, 'adding more pictures moved the cover').toBe(A);
  }, 90000);

  it('reordering is how the cover is chosen', async () => {
    /*
     * There is no "make this the cover". Whichever leads, leads — a second way
     * to say the same thing is how the two come to disagree.
     */
    const pkg = await getPackage(packageId);
    const ids = pkg!.images.map((i: PackageImage) => i.id);
    await reorderPackageImages({ packageId, ids: [ids[2], ids[0], ids[1]] });

    const after = await getPackage(packageId);
    expect(after?.images.map((i: PackageImage) => i.url)).toEqual([C, A, B]);
    expect(after?.cover_url, 'moving a picture to the front did not make it the cover').toBe(C);

    // Put it back for the tests below.
    await reorderPackageImages({ packageId, ids: [ids[0], ids[1], ids[2]] });
  }, 90000);

  it('each picture keeps its own framing', async () => {
    const pkg = await getPackage(packageId);
    const [first, second] = pkg!.images;
    await setPackageImagePosition({ id: first.id, packageId, position: '50% 20%' });
    await setPackageImagePosition({ id: second.id, packageId, position: '0% 80%' });

    const after = await getPackage(packageId);
    const framed = after!.images.map((i: PackageImage) => i.position);
    expect(framed[0], 'the first picture lost its framing').toBe('50% 20%');
    expect(framed[1], 'the second picture took the first one\'s framing').toBe('0% 80%');
    expect(framed[2], 'an untouched picture grew a framing').toBeNull();
    // And the derived cover carries the cover's own, not anybody else's.
    expect(after?.cover_position).toBe('50% 20%');
  }, 90000);

  it('every public reading gets the set and the cover', async () => {
    /*
     * The storefront card, and the page a client decides on. The second is the
     * one that hands the cover to OpenGraph, which is the whole reason a single
     * cover still exists.
     */
    const cards = await listPackagesPublicWithDimensions(TEST_ORG_ID);
    const card = cards.find((c: any) => c.id === packageId) as any;
    expect(card?.images?.length, 'the storefront card was not given the set').toBe(3);
    expect(card?.cover_url, 'the storefront card lost its cover').toBe(A);

    const page = await getPackagePublic(TEST_ORG_ID, packageId) as any;
    expect(page?.images?.length, 'the public page was not given the set').toBe(3);
    expect(page?.coverUrl, 'the public page lost the cover it hands to a link preview').toBe(A);
  }, 90000);

  it('taking one off leaves the rest in order', async () => {
    const pkg = await getPackage(packageId);
    const second = pkg!.images[1];
    await removePackageImage({ id: second.id, packageId });

    const after = await getPackage(packageId);
    expect(after?.images.map((i: PackageImage) => i.url)).toEqual([A, C]);
    expect(after?.cover_url, 'removing a later picture changed the cover').toBe(A);
  }, 90000);

  it('the database refuses a twenty-first', async () => {
    const { data: fresh } = await supabaseAdmin.from('packages')
      .insert({ organization_id: TEST_ORG_ID, name: 'Twenty', status: 'active' })
      .select('id').single();
    const full = fresh!.id as string;

    for (let i = 0; i < 20; i++) {
      await addPackageImage({ packageId: full, url: `https://example.test/pictures/${i}.webp` });
    }
    const twenty = await getPackage(full);
    expect(twenty?.images.length, 'twenty were not accepted').toBe(20);

    await expect(
      addPackageImage({ packageId: full, url: 'https://example.test/pictures/21.webp' }),
      'a twenty-first picture was accepted',
    ).rejects.toThrow(/20 pictures/);
  }, 180000);

  it('never reaches another studio\'s pictures', async () => {
    const otherOrg = randomUUID();
    const { error: seedError } = await supabaseAdmin.from('organizations')
      .insert({ id: otherOrg, name: 'Someone Else', status: 'active' });
    expect(seedError, 'could not seed the other studio').toBeFalsy();
    const { data: theirPkg } = await supabaseAdmin.from('packages')
      .insert({ organization_id: otherOrg, name: 'Theirs', status: 'active' }).select('id').single();
    const { data: theirPic } = await supabaseAdmin.from('package_images')
      .insert({ organization_id: otherOrg, package_id: theirPkg!.id, url: 'https://example.test/theirs.webp' })
      .select('id').single();

    try {
      // A write aimed at it changes nothing, rather than throwing and leaving
      // the caller believing it might have worked.
      await setPackageImagePosition({ id: theirPic!.id, packageId: theirPkg!.id, position: '0% 0%' });
      const { data: after } = await supabaseAdmin.from('package_images')
        .select('position').eq('id', theirPic!.id).single();
      expect(after!.position, 'another studio\'s picture was reframed').toBeNull();

      await removePackageImage({ id: theirPic!.id, packageId: theirPkg!.id });
      const { data: still } = await supabaseAdmin.from('package_images')
        .select('id').eq('id', theirPic!.id).maybeSingle();
      expect(still, 'another studio\'s picture was removed').toBeTruthy();
    } finally {
      await supabaseAdmin.from('package_images').delete().eq('organization_id', otherOrg);
      await supabaseAdmin.from('packages').delete().eq('organization_id', otherOrg);
      await supabaseAdmin.from('organizations').delete().eq('id', otherOrg);
    }
  }, 90000);
});
