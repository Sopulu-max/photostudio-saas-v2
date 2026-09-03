import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * THE WHOLE CHAIN, WALKED ONCE, ON THE EXACT SCENARIO IT WAS BUILT FOR.
 *
 *   1. Define "Edited Photographs" with a Type of Softcopy or Hardcopy.
 *   2. Add it to a service.
 *   3. Say that service only ever produces Softcopy.
 *   4. Promise it on a package, and settle the Type.
 *   5. See that settled structure EVERYWHERE the deliverable is specified.
 *
 * Step 5 is the one worth a test of its own, because it is the one that had
 * quietly broken. Each surface renders a promise from its own query, and when
 * the spec moved off the promise row and onto variable answers, only the
 * package page was taught where to look. The storefront and the client's own
 * confirmation went back to saying "20 Edited photographs" — the count without
 * the decision, on the two pages a CLIENT reads.
 *
 * So this asserts on every reader rather than on the mechanism. A chain is only
 * as true as its last link, and the last links here face outward.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'chain', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'chain', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import {
  createDeliverable, declareDeliverableVariable, setDeliverablesForService,
  listServiceCapabilities, setServiceDeliverableOptions,
} from '@/modules/deliverables/domain';
import {
  createPackage, getPackage, getPackagePublic, getPackageVariables,
} from '@/modules/packages/domain';
import { createBooking, shareBooking, getBookingByShareToken } from '@/modules/bookings/domain';
import { seedStudio, seedRow } from './seed';
import { PURGE_ORDER } from './purge';

let ctx: {
  domainId: string;
  serviceId: string;
  deliverableId: string;
  typeVarId: string;
  packageId: string;
};

describe('Edited Photographs, from declaring it to the client reading it', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Chain Studio' });

    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'Photography' }, 'the domain');
    const service = await seedRow('services',
      { organization_id: TEST_ORG_ID, name: 'Digital Retouching', service_domain_id: domain.id },
      'the service');

    // 1. The kind, and what it needs settling.
    const { outputTypeId } = await createDeliverable({
      serviceDomainId: domain.id, name: 'Edited Photographs',
    });
    const typeVar: any = await declareDeliverableVariable({
      deliverableId: outputTypeId,
      variable: { label: 'Type', kind: 'choice', options: ['Softcopy', 'Hardcopy'] },
    });

    // 2. The service produces it.
    await setDeliverablesForService({
      serviceId: service.id, serviceDomainId: domain.id, names: ['Edited Photographs'],
    });

    // 3. …and only ever as softcopy.
    const [capability] = await listServiceCapabilities(service.id);
    await setServiceDeliverableOptions({
      serviceDeliverableId: capability.serviceDeliverableId,
      variableId: typeVar.id,
      values: ['Softcopy'],
    });

    // 4. A package promises 20 of them, and settles the Type.
    const { packageId } = await createPackage({
      name: 'Retouch Twenty',
      serviceIds: [service.id],
      price: { base_price: 150_000, currency: 'NGN' } as any,
      deliverables: [{ serviceId: service.id, deliverableId: outputTypeId, quantity: 20 }],
      variableValues: [{ serviceVariableId: typeVar.id, value: 'Softcopy' }],
    } as any);

    ctx = {
      domainId: domain.id, serviceId: service.id,
      deliverableId: outputTypeId, typeVarId: typeVar.id, packageId,
    };
  }, 180000);

  afterAll(async () => {
    await supabaseAdmin.from('service_deliverable_options').delete().eq('organization_id', TEST_ORG_ID);
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('offers a package only what the service actually does', async () => {
    const asked: any = (await getPackageVariables(ctx.packageId))
      .find((v: any) => v.id === ctx.typeVarId);

    expect(asked, 'the deliverable’s question never reached the package').toBeTruthy();
    expect(asked.options, 'a digital-only service was still offering hardcopy')
      .toEqual(['Softcopy']);
    expect(asked.deliverableName, 'the question was not attributed to what produces it')
      .toBe('Edited Photographs');
  }, 60000);

  it('says what was settled on the studio’s own package page', async () => {
    const pkg: any = await getPackage(ctx.packageId);
    const promised = (pkg.services || [])
      .flatMap((s: any) => s.deliverables || [])
      .find((d: any) => d.id === ctx.deliverableId);

    expect(promised, 'the package page shows no promise at all').toBeTruthy();
    expect((promised.spec_values as any)?.type, 'the settled answer is missing from the package page')
      .toBe('Softcopy');
  }, 60000);

  it('says it on the storefront a client browses', async () => {
    /*
     * This read the name and the count and stopped. A studio that decided
     * softcopy decided it for the client, and the storefront is where a client
     * decides whether to book at all.
     */
    const pub: any = await getPackagePublic(TEST_ORG_ID, ctx.packageId);
    expect(pub, 'the package is not public at all').toBeTruthy();

    const line = (pub.deliverableNames as string[]).find((n) => n.includes('Edited Photographs'));
    expect(line, 'the storefront promises nothing').toBeTruthy();
    expect(line, 'the storefront dropped what was settled').toContain('Softcopy');
    expect(line, 'the storefront dropped how many').toContain('20');
  }, 60000);

  it('says it on the document the client keeps', async () => {
    const contact = await seedRow('contacts',
      { organization_id: TEST_ORG_ID, display_name: 'A Client' }, 'the client');
    const { bookingId } = await createBooking({
      contactId: contact.id,
      lines: [{ packageId: ctx.packageId, linePrice: { base_price: 150_000, currency: 'NGN' } }],
    });
    const { shareToken } = await shareBooking({ bookingId });

    const doc: any = await getBookingByShareToken(shareToken);
    expect(doc, 'the confirmation could not be read by its own token').toBeTruthy();

    /*
     * The document renders through the same formatter as everything else, so
     * what is asserted here is that the ANSWERS reached it — the query has to
     * carry them, and it did not.
     */
    const bundle = (doc.booking_lines || [])
      .flatMap((l: any) => l.package?.package_services || []);
    const answers = bundle.flatMap((r: any) => r.package_variable_values || []);
    const settled = answers.find((a: any) => a.variable?.deliverable_id === ctx.deliverableId);

    expect(settled, 'the confirmation never receives what the package settled').toBeTruthy();
    expect(settled.value, 'the confirmation received the wrong answer').toBe('Softcopy');
  }, 90000);
});
