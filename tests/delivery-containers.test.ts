import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * THE VESSELS THAT CARRY WORK TO A CLIENT.
 *
 * A gallery, a Drive folder, a USB stick. The ontology lists delivery
 * containers as built, and the table has been in the schema all along with a
 * real row in it — but nothing could reach one. `delivery_containers` appeared
 * in a single TypeScript union and nowhere else, and the page section headed
 * for them held `const containers: any[] = []` above a map over another empty
 * literal. Two independent guarantees that nothing would ever draw.
 *
 * So these functions are new, and this is what says they work. The rendering is
 * covered by the smoke suite; what is covered here is the writing, which smoke
 * cannot reach because it seeds rows directly.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'containers', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'containers', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import {
  listDeliveryContainers, createDeliveryContainer,
  renameDeliveryContainer, deleteDeliveryContainer,
  listDeliverables, createDeliverable, updateDeliverableConfig,
  declareDeliverableVariable, listVariablesForDeliverables, removeDeliverableVariable,
  deleteDeliverable, setDeliverablesForService,
  listServiceCapabilities, setServiceDeliverableOptions,
} from '@/modules/deliverables/domain';
import { formatDeliverable } from '@/modules/packages/deliverableSpec';
import { createPackage, duplicatePackage, getPackageVariables } from '@/modules/packages/domain';
import { createDeliverableAction } from '@/app/(app)/deliverables/new/actions';

import { seedStudio, seedRow } from './seed';
import { PURGE_ORDER } from './purge';
/** What a package's bundle rows promise, read straight from the tables. */
async function readPromises(packageId: string) {
  const { data: rows } = await supabaseAdmin
    .from('package_services').select('id').eq('package_id', packageId);
  const { data } = await supabaseAdmin
    .from('package_deliverables')
    .select('deliverable_id, quantity')
    .in('package_service_id', (rows || []).map((r: any) => r.id));
  return (data || []) as any[];
}

/** What a package settled for one variable, read straight from the table. */
async function readSettled(packageId: string, variableId: string) {
  const { data: rows } = await supabaseAdmin
    .from('package_services').select('id').eq('package_id', packageId);
  const { data } = await supabaseAdmin
    .from('package_variable_values')
    .select('value')
    .eq('variable_id', variableId)
    .in('package_service_id', (rows || []).map((r: any) => r.id));
  return (data || [])[0]?.value ?? null;
}

describe('the studio’s delivery containers', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Container Studio' });
  }, 120000);

  afterAll(async () => {
    await supabaseAdmin.from('delivery_containers').delete().eq('organization_id', TEST_ORG_ID);
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('starts with none, and adds one that comes back', async () => {
    expect(await listDeliveryContainers(), 'a new studio already has containers').toEqual([]);

    const { containerId } = await createDeliveryContainer('Google Drive folder');
    expect(containerId, 'nothing was created').toBeTruthy();

    const all = await listDeliveryContainers();
    expect(all.length, 'the container did not come back from the list').toBe(1);
    expect(all[0].name).toBe('Google Drive folder');
  });

  it('does not create a second one under the same name', async () => {
    const first = await createDeliveryContainer('USB stick');
    // Case-insensitive equality, per kernel/naming — a studio typing the same
    // vessel differently twice has one vessel, not two.
    const again = await createDeliveryContainer('usb STICK');
    expect(again.containerId, 'the same vessel was created twice').toBe(first.containerId);
  });

  it('renames in place and removes for good', async () => {
    const { containerId } = await createDeliveryContainer('Temporary');

    await renameDeliveryContainer(containerId, 'Renamed vessel');
    let all = await listDeliveryContainers();
    expect(all.find((c) => c.id === containerId)?.name, 'the rename did not stick')
      .toBe('Renamed vessel');

    await deleteDeliveryContainer(containerId);
    all = await listDeliveryContainers();
    expect(all.some((c) => c.id === containerId), 'the container survived removal').toBe(false);
  });

  it('refuses a container with no name', async () => {
    await expect(createDeliveryContainer('   '), 'a nameless vessel was accepted')
      .rejects.toThrow();
  });

  it('refuses to delete a deliverable anything is standing on', async () => {
    /*
     * DEFINED ONCE, REFERENCED EVERYWHERE — SO IT CANNOT SIMPLY GO.
     *
     * Every reference to a deliverable is ON DELETE CASCADE. A bare delete
     * therefore took every service's claim to produce it, every package's
     * promise of it, and — because a booking's package instance points at the
     * same row — the RECORD OF WHAT A CLIENT WAS PROMISED. On the real studio
     * that was six promises, three of them on live bookings, with no warning.
     *
     * The rule is the one deleteDimension already follows: it does not go while
     * anything is filed under it. And it says what is holding it, because
     * "cannot delete" with no subject is an instruction to go hunting.
     */
    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'Guarded' }, 'the domain');
    const service = await seedRow('services',
      { organization_id: TEST_ORG_ID, name: 'Guarded service', service_domain_id: domain.id },
      'the service');
    const { outputTypeId } = await createDeliverable({
      serviceDomainId: domain.id, name: 'Guarded output',
    });

    // Nothing stands on it yet, so it may go — and a fresh one takes its place.
    await deleteDeliverable(outputTypeId);
    expect((await listDeliverables()).some((d) => d.id === outputTypeId),
      'an unreferenced deliverable could not be removed').toBe(false);

    const { outputTypeId: heldId } = await createDeliverable({
      serviceDomainId: domain.id, name: 'Held output',
    });
    await setDeliverablesForService({
      serviceId: service.id, serviceDomainId: domain.id, names: ['Held output'],
    });

    await expect(deleteDeliverable(heldId), 'a deliverable in use was deleted anyway')
      .rejects.toThrow(/still in use/i);

    // And it names what is holding it rather than only refusing.
    await expect(deleteDeliverable(heldId)).rejects.toThrow(/produces it/i);

    // Still there, with its capability intact.
    expect((await listDeliverables()).some((d) => d.id === heldId),
      'the refusal did not actually keep it').toBe(true);
  }, 90000);

  it('asks the client a deliverable’s question when the package leaves it open', async () => {
    /*
     * THE CHAIN HAS TO REACH THE END, OR "LEAVE IT TO THE CLIENT" IS A SETTING
     * THAT DOES NOTHING.
     *
     * A deliverable declares "Type: softcopy or hardcopy". A package promising
     * edited photographs can fix it — or leave it open, meaning the client
     * chooses at booking. The client's form gathers its questions from
     * getPackageVariables, and that gatherer knew only about services and
     * classifications: a studio could set a deliverable's question to "the
     * client decides" and no client would ever have seen it.
     *
     * Asked because of WHAT IS PRODUCED, not who produces it — so it carries
     * the deliverable that owns it rather than being stamped with a service.
     */
    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'Copy Types' }, 'the domain');
    const service = await seedRow('services',
      { organization_id: TEST_ORG_ID, name: 'Retouching', service_domain_id: domain.id }, 'the service');
    const { outputTypeId } = await createDeliverable({
      serviceDomainId: domain.id, name: 'Edited Photographs',
    });

    await declareDeliverableVariable({
      deliverableId: outputTypeId,
      variable: { label: 'Type', kind: 'choice', options: ['Softcopy', 'Hardcopy'] },
    });

    const { packageId } = await createPackage({
      name: 'Retouch Package',
      serviceIds: [service.id],
      deliverables: [{ serviceId: service.id, deliverableId: outputTypeId, quantity: 10 }],
    });

    const asked = await getPackageVariables(packageId);
    const typeQ: any = asked.find((v: any) => v.label === 'Type');

    expect(typeQ, 'the deliverable’s question never reached the client’s form').toBeTruthy();
    expect(typeQ.options, 'the permitted answers were lost on the way')
      .toEqual(['Softcopy', 'Hardcopy']);
    // Attributed to what produces it, not to whoever happens to make it.
    expect(typeQ.deliverableName, 'the question was stamped with the wrong owner')
      .toBe('Edited Photographs');
    expect(typeQ.serviceId, 'a deliverable’s question was blamed on a service').toBeNull();
  }, 90000);

  it('offers only what the service does, when the service is narrower than the kind', async () => {
    /*
     * possibility → restriction → fact.
     *
     * "Edited Photographs" may be Softcopy or Hardcopy — the possibility. But
     * Digital Retouching only ever produces softcopy, which is a fact about the
     * WORK and not about how any package sells it. Without somewhere to say so,
     * every package bundling that service had to be trusted to pick softcopy,
     * and a client left to choose could pick hardcopy from a service that does
     * not print.
     *
     * The narrowing hangs off the CAPABILITY row — this service producing this
     * kind — because that is the sentence it qualifies.
     */
    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'Digital Only' }, 'the domain');
    const service = await seedRow('services',
      { organization_id: TEST_ORG_ID, name: 'Digital Retouching', service_domain_id: domain.id },
      'the service');
    const { outputTypeId } = await createDeliverable({
      serviceDomainId: domain.id, name: 'Retouched Photographs',
    });
    const typeVar: any = await declareDeliverableVariable({
      deliverableId: outputTypeId,
      variable: { label: 'Type', kind: 'choice', options: ['Softcopy', 'Hardcopy'] },
    });

    await setDeliverablesForService({
      serviceId: service.id, serviceDomainId: domain.id, names: ['Retouched Photographs'],
    });
    const [capability] = await listServiceCapabilities(service.id);
    expect(capability, 'the service produces nothing').toBeTruthy();

    const { packageId } = await createPackage({
      name: 'Retouch Only',
      serviceIds: [service.id],
      deliverables: [{ serviceId: service.id, deliverableId: outputTypeId, quantity: 5 }],
    });

    // Before narrowing, both answers stand.
    let asked: any = (await getPackageVariables(packageId)).find((v: any) => v.id === typeVar.id);
    expect(asked.options, 'the declared answers did not reach the form')
      .toEqual(['Softcopy', 'Hardcopy']);

    await setServiceDeliverableOptions({
      serviceDeliverableId: capability.serviceDeliverableId,
      variableId: typeVar.id,
      values: ['Softcopy'],
    });

    asked = (await getPackageVariables(packageId)).find((v: any) => v.id === typeVar.id);
    expect(asked.options, 'a service that does not print was still offering hardcopy')
      .toEqual(['Softcopy']);

    // Clearing it means "it does both again", not "it does nothing" — a service
    // permitting no answer could never be sold.
    await setServiceDeliverableOptions({
      serviceDeliverableId: capability.serviceDeliverableId,
      variableId: typeVar.id,
      values: [],
    });
    asked = (await getPackageVariables(packageId)).find((v: any) => v.id === typeVar.id);
    expect(asked.options, 'clearing the narrowing left the service able to do nothing')
      .toEqual(['Softcopy', 'Hardcopy']);
  }, 120000);

  it('refuses to permit an answer the question does not offer', async () => {
    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'Strict' }, 'the domain');
    const service = await seedRow('services',
      { organization_id: TEST_ORG_ID, name: 'Strict service', service_domain_id: domain.id },
      'the service');
    const { outputTypeId } = await createDeliverable({
      serviceDomainId: domain.id, name: 'Strict output',
    });
    const v: any = await declareDeliverableVariable({
      deliverableId: outputTypeId,
      variable: { label: 'Finish', kind: 'choice', options: ['Matte', 'Gloss'] },
    });
    await setDeliverablesForService({
      serviceId: service.id, serviceDomainId: domain.id, names: ['Strict output'],
    });
    const [cap] = await listServiceCapabilities(service.id);

    await expect(setServiceDeliverableOptions({
      serviceDeliverableId: cap.serviceDeliverableId, variableId: v.id, values: ['Neon'],
    }), 'a narrowing permitted an answer the question never offered').rejects.toThrow(/not one of the answers/i);
  }, 90000);

  it('creates a container from the create page, which it never could before', async () => {
    /*
     * THE HALF OF THAT PAGE THAT NEVER WORKED.
     *
     * Both choices went to createDeliverable, which resolves a name inside a
     * service domain — and a container has none, so it arrived with an empty
     * domain id. findOrCreateDeliverableNamed returns null for that, and the
     * caller throws "Give the deliverable a name." So an operator picking
     * Delivery Container was told the name was wrong, when the name was the one
     * thing that was right.
     *
     * The page routes to createDeliveryContainer now. This pins the seam rather
     * than the page: a container must not need a domain, and must not land in
     * the deliverables vocabulary.
     */
    const before = (await listDeliverables()).length;

    const { containerId } = await createDeliveryContainer('Bare USB');
    expect(containerId, 'a container still cannot be made without a domain').toBeTruthy();

    expect((await listDeliveryContainers()).some((c) => c.id === containerId),
      'the container was not created').toBe(true);
    expect((await listDeliverables()).length,
      'a container was filed as a deliverable').toBe(before);
  }, 60000);

  it('declares what it needs settling in the same act as naming it', async () => {
    /*
     * ONE ACT, NOT TWO.
     *
     * The create page took a domain, a name and a unit, then sent an operator to
     * the deliverable's own page to say what it needs settling — which is the
     * whole point of a deliverable being a KIND rather than a word. "Edited
     * photographs, and they are softcopy or hardcopy" is one thought.
     *
     * The questions are written after the row exists, because a variable needs
     * an owner, but they arrive in the same submission.
     */
    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'One Act' }, 'the domain');

    const { id, refused } = await createDeliverableAction({
      domainId: domain.id,
      name: 'Retouched Prints',
      unit: 'print',
      questions: [
        { label: 'Copy type', kind: 'choice', unit: null, options: ['Softcopy', 'Hardcopy'] },
        { label: 'Notes', kind: 'text', unit: null, options: [] },
      ],
    });

    expect(refused, 'a question was refused during creation').toEqual([]);

    const made = (await listDeliverables()).find((d) => d.id === id);
    expect(made, 'the deliverable was not created').toBeTruthy();
    expect(made!.default_unit, 'the unit typed on the create page was lost').toBe('print');

    const declared = await listVariablesForDeliverables([id]);
    expect(declared.length, 'the questions did not travel with the creation').toBe(2);

    const copyType: any = declared.find((v: any) => v.label === 'Copy type');
    expect(copyType.options, 'the permitted answers were lost').toEqual(['Softcopy', 'Hardcopy']);
    expect(copyType.deliverable_id, 'the question was not owned by the deliverable').toBe(id);
  }, 90000);

  it('returns the columns it promises — the unit a deliverable is counted in', async () => {
    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'Framing' }, 'the domain');
    const { outputTypeId } = await createDeliverable({
      serviceDomainId: domain.id, name: 'Framed print',
    });

    /*
     * default_unit is what formatDeliverable counts in — "30 seconds video"
     * rather than "30 video". It is live, and it was one of three columns
     * listDeliverables mapped onto every row while selecting none of them, so
     * it arrived undefined on every read the app made.
     *
     * What a deliverable NEEDS SETTLING is no longer here: spec_schema was a
     * variable system invented for one screen, and a deliverable declares real
     * variables now — see the third-owner test above.
     */
    await updateDeliverableConfig(outputTypeId, { default_unit: 'print' });

    const found = (await listDeliverables()).find((d) => d.id === outputTypeId);
    expect(found, 'the deliverable is not in the list at all').toBeTruthy();
    expect(found!.default_unit, 'default_unit came back undefined again').toBe('print');
  }, 60000);

  it('carries what a package settled onto a copy of it', async () => {
    /*
     * THE DRIFT THAT MOVING THE EDGE FOUND, ON ITS NEW PATH.
     *
     * The original fault: saving a package wrote deliverable_id, quantity AND
     * spec_values, while copying one — what duplicating does, and what
     * instancing a package for a booking does — selected and inserted only the
     * first two. A duplicate said "Framed print" where the original said
     * "Framed print · 20x30", and a client's own instance of a package lost the
     * specification it was sold with.
     *
     * spec_values is gone now: a deliverable declares real variables and a
     * package answers them like any other. But the fault it exposed was never
     * about that column — it was a copier listing its columns by hand and
     * missing one. So the guard follows the answer to where it lives, and
     * insists a duplicate carries what the original settled.
     */
    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'Print Shop' }, 'the domain');
    const service = await seedRow('services',
      { organization_id: TEST_ORG_ID, name: 'Printing', service_domain_id: domain.id }, 'the service');
    const { outputTypeId } = await createDeliverable({
      serviceDomainId: domain.id, name: 'Wall print',
    });

    // What a wall print needs settling, declared once on the kind.
    const sizeVar: any = await declareDeliverableVariable({
      deliverableId: outputTypeId,
      variable: { label: 'Size', kind: 'choice', options: ['20x30', '16x20'] },
    });

    const { packageId } = await createPackage({
      name: 'Print Package',
      serviceIds: [service.id],
      deliverables: [{ serviceId: service.id, deliverableId: outputTypeId, quantity: 3 }],
      // The package settles it — the same act as fixing a service's variable.
      variableValues: [{ serviceVariableId: sizeVar.id, value: '20x30' }],
    } as any);

    const original = await readPromises(packageId);
    expect(original.length, 'the promise was not saved at all').toBe(1);
    expect(Number(original[0].quantity), 'the quantity never reached the original').toBe(3);
    expect(await readSettled(packageId, sizeVar.id),
      'the answer never reached the original').toBe('20x30');

    const copy = await duplicatePackage(packageId);
    const copied = await readPromises(copy.packageId);

    expect(copied.length, 'the copy promises nothing').toBe(1);
    expect(Number(copied[0].quantity), 'the quantity did not travel').toBe(3);
    expect(await readSettled(copy.packageId, sizeVar.id),
      'what the package settled was dropped by the copy').toBe('20x30');
  }, 90000);

  it('declares what it needs settling as a real variable, not a shape of its own', async () => {
    /*
     * THE THIRD OWNER OF A VARIABLE, NOT A THIRD MECHANISM.
     *
     * A variable already has a kind, a unit, options, bounds and a default; a
     * package already decides whether it fixes one or leaves it to the client;
     * a booking line already holds the answer. The dimension migration made
     * exactly this argument when a classification became the second owner, and
     * called the alternative "the duplication this codebase keeps paying for".
     *
     * I built that duplication anyway — a jsonb spec_schema with three field
     * types against the eight the real one checks, no unit, no bounds, no
     * default, and no share of parseVariableValue. This is what says the
     * correction works: a deliverable's declaration is an ordinary variable.
     */
    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'Album Bindery' }, 'the domain');
    const { outputTypeId } = await createDeliverable({
      serviceDomainId: domain.id, name: 'Bound album',
    });

    const made: any = await declareDeliverableVariable({
      deliverableId: outputTypeId,
      variable: { label: 'Cover material', kind: 'choice', options: ['Linen', 'Leather'] },
    });
    expect(made.deliverable_id, 'it was not owned by the deliverable').toBe(outputTypeId);
    expect(made.service_id, 'it claimed a service as well').toBeNull();
    expect(made.dimension_id, 'it claimed a classification as well').toBeNull();
    // The key is derived from the label, so a studio names a thing once.
    expect(made.key).toBe('cover_material');

    const declared = await listVariablesForDeliverables([outputTypeId]);
    expect(declared.length, 'the declaration did not come back').toBe(1);
    expect(declared[0].options, 'the permitted answers were lost').toEqual(['Linen', 'Leather']);

    // Asking twice for the same thing finds the one that exists.
    const again: any = await declareDeliverableVariable({
      deliverableId: outputTypeId,
      variable: { label: 'Cover material', kind: 'choice', options: ['Linen'] },
    });
    expect(again.id, 'declaring the same field twice made two').toBe(made.id);

    await removeDeliverableVariable(made.id);
    expect((await listVariablesForDeliverables([outputTypeId])).length,
      'the declaration survived removal').toBe(0);
  }, 90000);

  it('refuses a variable that claims two owners', async () => {
    /*
     * The check constraint is what keeps one mechanism from becoming three. If
     * it ever stops refusing this, a row could be a service's AND a
     * deliverable's, and every reader that filters by one owner would be wrong.
     */
    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'Two Owners' }, 'the domain');
    const service = await seedRow('services',
      { organization_id: TEST_ORG_ID, name: 'Some service', service_domain_id: domain.id }, 'the service');
    const { outputTypeId } = await createDeliverable({
      serviceDomainId: domain.id, name: 'Some output',
    });

    const { error } = await supabaseAdmin.from('variables').insert({
      organization_id: TEST_ORG_ID,
      service_id: service.id,
      deliverable_id: outputTypeId,
      key: 'both', label: 'Both', kind: 'text', options: [], position: 0,
    });
    expect(error, 'a variable was allowed to belong to two things at once').toBeTruthy();
    expect(String(error?.message)).toMatch(/one_owner|violates check/i);
  }, 60000);

  it('returns the spec columns it promises, instead of undefined', async () => {
    /*
     * listDeliverables mapped d.default_unit, d.spec_schema and d.spec_values
     * onto every row while the .select() asked for none of them — so all three
     * arrived undefined, always. Its signature did not mention them either, so
     * the type system had nothing to disagree with and no caller could see the
     * fields existed.
     *
     * The columns are all null on real data today, which is exactly why this
     * went unnoticed: undefined and null read the same at a glance. So this
     * writes a value and insists it survives the round trip.
     */
    const domain = await seedRow('service_domains',
      { organization_id: TEST_ORG_ID, name: 'Printing' }, 'the domain');
    const { outputTypeId } = await createDeliverable({
      serviceDomainId: domain.id, name: 'Framed print',
    });

    await supabaseAdmin.from('deliverables')
      .update({ default_unit: 'print' })
      .eq('id', outputTypeId).eq('organization_id', TEST_ORG_ID);

    const found = (await listDeliverables()).find((d) => d.id === outputTypeId);
    expect(found, 'the deliverable is not in the list at all').toBeTruthy();
    expect(found!.default_unit, 'default_unit came back undefined again').toBe('print');
    // A row that has not set one says null, not undefined — the shape a caller
    // can test against.
    expect((await listDeliverables()).find((d) => d.name === 'Held output')!.default_unit,
      'an unset unit is not null').toBeNull();
  }, 60000);
});

/*
 * One sentence for a deliverable, everywhere it is read.
 *
 * Pure — no studio, no database — which is why it sits in its own block. A
 * describe that needs seeded rows must live inside the one that seeds them, or
 * it runs after that block's afterAll has already purged the organization.
 */
describe('how a deliverable reads', () => {
  it('reads the same sentence everywhere, through one formatter', async () => {
    // A package's own answer wins over the kind's usual one; the formatter is
    // what every page uses, so they cannot phrase it differently.
    expect(formatDeliverable({
      name: 'Framed print', quantity: 2, spec_values: { size: '16x20' },
    })).toBe('2 Framed print · 16x20');

    expect(formatDeliverable({
      name: 'video', quantity: 30, unit: 'second',
    })).toBe('30 seconds video');

    // Nothing declared is still a deliverable — the simple end of the range.
    expect(formatDeliverable({ name: 'Edited photograph' })).toBe('Edited photograph');
  });
});
