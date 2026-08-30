import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * An Occasion has a date.
 *
 * THE IDEA BEING PINNED. A dimension is a question the studio asks about its
 * work — the schema says so in its own `question` column. Until now the only
 * thing a question could carry was its list of acceptable answers: it could ask
 * "what occasion is it for?" and accept "Birthday", and then have nothing
 * further to say, even though a birthday obviously has a date.
 *
 * A dimension can now declare what follows from its answers, once, for the
 * whole studio. Every package classified that way inherits the field, and
 * decides by the ordinary rule whether the studio fixes it or the client
 * answers it at booking.
 *
 * WHAT WOULD OTHERWISE HAPPEN. The date would be a free-text question invented
 * inside one package, re-invented in the next, connected to the Occasion
 * dimension in neither — so no studio could ever ask when this month's
 * occasions are, and every package serving birthdays would carry its own
 * unrelated copy of the same question.
 *
 * WHAT MUST NOT HAPPEN, and half this file is about it: the field must reach
 * only packages actually classified by that dimension, and it must be asked of
 * a client only where the package said to ask. Inheriting is not the same as
 * asking.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'occasion-date', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'occasion-date', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createService, declareDimensionVariable, listVariablesForDimensions } from '@/modules/services/domain';
import { createDimension, addDimensionValue } from '@/modules/services/dimensionsAdmin';
import {
  createPackage, updatePackage, getOpenVariablesForPackagePublic, getPackageVariablesPublic,
} from '@/modules/packages/domain';
import { PURGE_ORDER } from './purge';

const DOMAIN = 'Photography';
let serviceId = '';
let domainId = '';
let occasionId = '';
let birthdayId = '';
let dateVariableId = '';

describe('A dimension says what follows from its answers', () => {
  beforeAll(async () => {
    await supabaseAdmin.from('organizations').insert({
      id: TEST_ORG_ID, name: 'Occasion Date Studio', status: 'active',
    });
    await supabaseAdmin.from('contacts').insert({
      id: TEST_PERSON_ID, organization_id: TEST_ORG_ID, display_name: 'Owner',
    });

    const created = await createService({
      name: 'Portrait Photography', serviceDomain: DOMAIN, primaryDeliverable: 'Edited image',
    });
    serviceId = created.serviceId;

    const { data: domain } = await supabaseAdmin.from('service_domains')
      .select('id').eq('organization_id', TEST_ORG_ID).eq('name', DOMAIN).single();
    domainId = domain!.id;

    const dimension: any = await createDimension({
      serviceDomainId: domainId, name: 'Occasion', question: 'What occasion is it for?',
    });
    occasionId = dimension?.dimensionId ?? dimension?.id;
    /*
     * addDimensionValue answers { ok: true }, not the row — so the id has to be
     * read back. The first version of this file assumed a returned id, got
     * undefined, and its seed insert failed silently: the fixture then had a
     * service classified by nothing, and the test blamed the product for not
     * inheriting a field there was no classification to inherit it through.
     */
    await addDimensionValue({ dimensionId: occasionId, name: 'Birthday' });
    const { data: value } = await supabaseAdmin
      .from('dimension_values').select('id')
      .eq('dimension_id', occasionId).eq('name', 'Birthday').single();
    birthdayId = value!.id;

    // The service is classified Birthday, so a package of it inherits whatever
    // Occasion says follows from that. Checked, because a swallowed insert here
    // strands the fixture and blames the code.
    const { error: classifyError } = await supabaseAdmin.from('service_dimension_values').insert({
      organization_id: TEST_ORG_ID, service_id: serviceId, dimension_value_id: birthdayId,
    });
    if (classifyError) throw new Error(`Could not classify the service: ${classifyError.message}`);
  });

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('dimension_values').delete().eq('organization_id', TEST_ORG_ID);
    await supabaseAdmin.from('dimensions').delete().eq('organization_id', TEST_ORG_ID);
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('declares the date on the question rather than on any one package', async () => {
    const declared = await declareDimensionVariable({
      dimensionId: occasionId,
      variable: { key: 'date', label: 'Date of the occasion', kind: 'date' } as any,
    });
    expect(declared?.id, 'the dimension could not carry a variable').toBeTruthy();
    dateVariableId = declared!.id;

    // Owned by the question, not by a service: that is what makes it declared
    // once and inherited by everything classified this way.
    expect(declared!.serviceId, 'a dimension variable was given a service owner').toBeNull();
    expect((declared as any).dimensionId).toBe(occasionId);

    // Asking twice finds the one that exists rather than making a second.
    const again = await declareDimensionVariable({
      dimensionId: occasionId,
      variable: { key: 'date', label: 'Date of the occasion', kind: 'date' } as any,
    });
    expect(again?.id, 'declaring the same thing twice made two of them').toBe(dateVariableId);

    const onDimension = await listVariablesForDimensions([occasionId]);
    expect(onDimension.map((v) => v.id)).toContain(dateVariableId);
  });

  it('reaches a package classified that way, without being added to it', async () => {
    const pkg = await createPackage({ name: 'Birthday Portrait', serviceIds: [serviceId] });
    const all = await getPackageVariablesPublic(TEST_ORG_ID, pkg.packageId);
    expect(
      all.map((v: any) => v.id),
      'the date the Occasion declares did not reach a package classified by it',
    ).toContain(dateVariableId);
  });

  it('inheriting it is not the same as asking for it', async () => {
    /*
     * The rule that stops a declaration leaking onto a live booking form. A
     * package inherits the field the moment it is classified; whether a client
     * is asked is a separate decision nobody has made yet.
     */
    const pkg = await createPackage({ name: 'Quiet Birthday', serviceIds: [serviceId] });
    const asked = await getOpenVariablesForPackagePublic(TEST_ORG_ID, pkg.packageId);
    expect(
      asked.map((v: any) => v.id),
      'an undecided field was put on the public booking form',
    ).not.toContain(dateVariableId);
  });

  it('is asked at booking once the package says the client answers it', async () => {
    const pkg = await createPackage({ name: 'Asked Birthday', serviceIds: [serviceId] });
    await updatePackage({
      packageId: pkg.packageId,
      variableValues: [{ serviceVariableId: dateVariableId, answeredBy: 'client' }],
    });

    const asked = await getOpenVariablesForPackagePublic(TEST_ORG_ID, pkg.packageId);
    const field = asked.find((v: any) => v.id === dateVariableId);
    expect(field, 'the client is not asked for the occasion date').toBeTruthy();
    // Typed, which is the whole gain over a free-text question invented in a
    // package: the client gets a date picker and the answer comes back a date.
    expect(field!.kind).toBe('date');
  });

  it('does not reach a package that is not classified by that question', async () => {
    const other = await createService({
      name: 'Product Photography', serviceDomain: DOMAIN, primaryDeliverable: 'Edited image',
    });
    const pkg = await createPackage({ name: 'Product Shoot', serviceIds: [other.serviceId] });
    const all = await getPackageVariablesPublic(TEST_ORG_ID, pkg.packageId);
    expect(
      all.map((v: any) => v.id),
      'a field arrived on a package that carries no Occasion at all',
    ).not.toContain(dateVariableId);
  });
});
