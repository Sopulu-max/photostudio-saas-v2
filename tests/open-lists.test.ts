import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * A service leaves its lists open, and a package is what opens them.
 *
 * THE IDEA BEING PINNED. A service names some values, some outputs and some
 * steps; none of those lists is the whole of what the service can be. They are
 * what the studio happened to say on the day it created the service. Building a
 * package is where the rest gets discovered — you find out you sell a Beach
 * portrait at the moment you are assembling the package that sells one — so a
 * package must be able to add to those lists rather than only pick from them.
 *
 * WHY IT NEEDED A TEST. Each list was closed in a different way and would break
 * in a different way, and one of the three had a working server path that
 * nothing in the app could reach.
 *
 * WHAT MUST STAY DIFFERENT. Where the new thing lands is not uniform, and the
 * asymmetry is the point:
 *
 *   A VALUE lands on the dimension, never on the service, because a service's
 *   values are the default a package inherits when it says nothing — so adding
 *   one to the service would silently reclassify every package that had never
 *   mentioned it. One test here exists only to hold that line.
 *
 *   AN OUTPUT lands on the service, because outputs are a menu and nothing is
 *   promised until a package states a quantity.
 *
 *   A STEP stays on the package, because a workflow is how the service is
 *   produced generally, and every other package of it would otherwise inherit
 *   work that only this one involves.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'open-lists', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'open-lists', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import {
  createService, declareServiceDeliverable, findOrCreateDimensionValue, getService,
} from '@/modules/services/domain';
import { createPackage, updatePackage, getPackage } from '@/modules/packages/domain';
import { createDimension, addDimensionValue, listDimensionsForDomain } from '@/modules/services/dimensionsAdmin';
import { PURGE_ORDER } from './purge';

const DOMAIN = 'Photography';
let serviceId = '';
let domainId = '';
let contextDimensionId = '';

describe('A package adds to what a service left open', () => {
  beforeAll(async () => {
    await supabaseAdmin.from('organizations').insert({
      id: TEST_ORG_ID, name: 'Open Lists Studio', status: 'active',
    });
    await supabaseAdmin.from('contacts').insert({
      id: TEST_PERSON_ID, organization_id: TEST_ORG_ID, display_name: 'Open Lists Owner',
    });

    const created = await createService({
      name: 'Portrait Photography', serviceDomain: DOMAIN, primaryDeliverable: 'Edited image',
    });
    serviceId = created.serviceId;

    const { data: domain } = await supabaseAdmin.from('service_domains')
      .select('id').eq('organization_id', TEST_ORG_ID).eq('name', DOMAIN).single();
    domainId = domain!.id;

    // The studio's own vocabulary: Context, holding the two values a studio
    // would plausibly type on the first day and then never revisit.
    const dimension: any = await createDimension({ serviceDomainId: domainId, name: 'Context' });
    contextDimensionId = dimension?.dimensionId ?? dimension?.id;
    await addDimensionValue({ dimensionId: contextDimensionId, name: 'Studio' });
    await addDimensionValue({ dimensionId: contextDimensionId, name: 'Outdoor' });
  });

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('creates a classification the service never named, and narrows to it', async () => {
    const beachId = await findOrCreateDimensionValue({
      serviceDomainId: domainId, dimensionName: 'Context', value: 'Beach',
    });
    expect(beachId, 'a value invented while packaging was not created').toBeTruthy();

    const pkg = await createPackage({
      name: 'Beach Portrait', serviceIds: [serviceId],
      narrowings: [{ serviceId, valueId: beachId! }],
    });
    const read: any = await getPackage(pkg.packageId);
    const names = (read.services[0].narrowedTo || []).flatMap((d: any) => d.values.map((v: any) => v.name));
    expect(names, 'the package was not classified by the value it invented').toContain('Beach');
  });

  it('leaves the value on the domain and off the service, so nothing is reclassified', async () => {
    /*
     * THE CASCADE THIS TEST EXISTS FOR. Creating Beach widens what the DOMAIN
     * can express, not what the SERVICE asserts about itself. A package that
     * says nothing about Context inherits the service's values, so a Beach link
     * on the service would make every plain package read as Beach as well.
     */
    const dimensions: any[] = await listDimensionsForDomain(domainId) as any;
    const context = dimensions.find((d) => d.name === 'Context');
    expect(
      (context?.values || []).map((v: any) => v.name),
      'the created value did not reach the domain, so no other package can use it',
    ).toContain('Beach');

    const service: any = await getService(serviceId);
    const serviceContexts = (service.dimensions || []).flatMap((d: any) => (d.values || []).map((v: any) => v.name));
    expect(
      serviceContexts,
      'creating a value from a package silently reclassified the service itself',
    ).not.toContain('Beach');
  });

  it('declares an output onto the service, so every package of it can promise one', async () => {
    const before: any = await getService(serviceId);
    expect((before.deliverables || []).map((d: any) => d.name)).not.toContain('Retouched album');

    const declared = await declareServiceDeliverable({ serviceId, name: 'Retouched album' });
    expect(declared?.id).toBeTruthy();

    const after: any = await getService(serviceId);
    expect(
      (after.deliverables || []).map((d: any) => d.name),
      'the output did not join the service, so no other package could promise it',
    ).toContain('Retouched album');

    // Asking twice is the same answer, not a second output with one name.
    const again = await declareServiceDeliverable({ serviceId, name: 'Retouched album' });
    expect(again?.id, 'declaring the same output twice made two of them').toBe(declared?.id);
  });

  it('promises nothing by declaring an output — the menu widened, the offer did not', async () => {
    const pkg = await createPackage({ name: 'Plain Portrait', serviceIds: [serviceId] });
    const read: any = await getPackage(pkg.packageId);
    expect(
      (read.services[0].deliverables || []).length,
      'widening what a service offers silently promised it in a package',
    ).toBe(0);
  });

  it('adds a step this package alone involves, without touching the workflow', async () => {
    const pkg = await createPackage({ name: 'Deluxe Portrait', serviceIds: [serviceId] });
    await updatePackage({
      packageId: pkg.packageId,
      tasks: [{ serviceId, name: 'Assemble the album', roleName: 'Retoucher', isActive: true }],
    });

    const read: any = await getPackage(pkg.packageId);
    const own = (read.services[0].tasks || []).find((t: any) => t.name === 'Assemble the album');
    expect(own, 'a package could not add work of its own').toBeTruthy();
    expect(own.roleName, 'the role named on a new task was not found or created').toBe('Retoucher');
    // No workflow origin: this belongs to the package, so syncing the service's
    // workflow can never claim it or rewrite it.
    expect(own.workflowTaskId, 'a package-owned step was recorded as belonging to a workflow').toBeFalsy();

    const other = await createPackage({ name: 'Basic Portrait', serviceIds: [serviceId] });
    const otherRead: any = await getPackage(other.packageId);
    expect(
      (otherRead.services[0].tasks || []).map((t: any) => t.name),
      'a step added to one package leaked into every package of the service',
    ).not.toContain('Assemble the album');
  });
});
