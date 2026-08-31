import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * A service can be seen, and keeps its picture through an ordinary edit.
 *
 * WHAT THIS PINS, and why it is worth pinning. Not that a column exists — that
 * a cover survives an update that says nothing about it. This exact failure has
 * been shipped four separate times in this repository: the workflow deleted by
 * a form that was never given it, the variables, the intake questions, and the
 * package price. Every one was the same mistake, that absent and null were
 * treated as the same instruction.
 *
 * So the three states are checked as three different things:
 *   undefined  — not mine to speak for; leave what is there
 *   null       — I am speaking for it, and it is now empty
 *   a value    — I am speaking for it, and this is what it is
 *
 * The focal point is checked alongside the url because they move together and
 * are written by two different calls: choosing a picture, and dragging it.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'cv', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'cv', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createService, updateService, getService, listServices } from '@/modules/services/domain';
import { PURGE_ORDER } from './purge';

let serviceId = '';
const PICTURE = 'https://example.test/cover-a.webp';

describe('A service can be seen', () => {
  beforeAll(async () => {
    await supabaseAdmin.from('organizations').insert({
      id: TEST_ORG_ID, name: 'Cover Studio', status: 'active',
    });
    await supabaseAdmin.from('contacts').insert({
      id: TEST_PERSON_ID, organization_id: TEST_ORG_ID, display_name: 'Cover Owner',
    });
    const created = await createService({
      name: 'Portrait Session',
      serviceDomain: 'Photography',
      primaryDeliverable: 'Edited image',
    } as any);
    serviceId = created.serviceId;
  });

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('starts without one, which is a service too', async () => {
    const service: any = await getService(serviceId);
    expect(service?.cover_url ?? null).toBeNull();
  });

  it('takes a picture, and the point in it to look at', async () => {
    await updateService({ serviceId, coverUrl: PICTURE });
    await updateService({ serviceId, coverPosition: '50% 30%' });
    const service: any = await getService(serviceId);
    expect(service.cover_url).toBe(PICTURE);
    expect(service.cover_position).toBe('50% 30%');
  });

  it('keeps both through an edit that never mentions them', async () => {
    // The shape of the bug that has cost this repo four features: a form
    // renaming a service says nothing about the cover, and absent must mean
    // leave it alone rather than clear it.
    await updateService({ serviceId, name: 'Portrait Session II' });
    const service: any = await getService(serviceId);
    expect(service.name).toBe('Portrait Session II');
    expect(service.cover_url, 'renaming a service wiped its cover').toBe(PICTURE);
    expect(service.cover_position, 'renaming a service wiped its focal point').toBe('50% 30%');
  });

  it('is cleared by null, which is a different instruction from silence', async () => {
    await updateService({ serviceId, coverUrl: null });
    const service: any = await getService(serviceId);
    expect(service.cover_url).toBeNull();
  });

  it('reaches the catalogue, not only the service page', async () => {
    // The card reads from listServices, which selects its own columns — a
    // cover readable on the detail page and absent from the grid would look
    // exactly like a cover that never saved.
    await updateService({ serviceId, coverUrl: PICTURE, coverPosition: '10% 90%' });
    const all: any[] = await listServices();
    const mine = all.find((s) => s.id === serviceId);
    expect(mine?.cover_url, 'listServices does not select the cover').toBe(PICTURE);
    expect(mine?.cover_position).toBe('10% 90%');
  });

  it('can be given one at the moment it is created', async () => {
    const created = await createService({
      name: 'Album Design',
      serviceDomain: 'Photography',
      coverUrl: PICTURE,
      coverPosition: '0% 0%',
    } as any);
    const service: any = await getService(created.serviceId);
    expect(service.cover_url).toBe(PICTURE);
    expect(service.cover_position).toBe('0% 0%');
  });
});
