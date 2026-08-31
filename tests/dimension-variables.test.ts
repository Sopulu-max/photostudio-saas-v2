import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * A question carries what follows from its answers.
 *
 * An Occasion has a date. A Context has an address. Those are two instances of
 * one thing, and the file is named for the thing rather than for the instance
 * that prompted it — a test file called occasion-date invites the next person
 * to believe the mechanism is about occasions.
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
import { createDimension, addDimensionValue, moveDimension, listDimensionsForDomain } from '@/modules/services/dimensionsAdmin';
import {
  createPackage, updatePackage, getOpenVariablesForPackagePublic, getPackageVariablesPublic,
  getOpenClassificationsForPackagePublic, answerPackageClassifications, getPackage,
  getOpenQuestionsForPackage,
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

  it('puts each new question after the ones already there', async () => {
    /*
     * Two orders exist and both are real: the join carries how one domain
     * arranges the questions it asks, and this carries the studio's own — which
     * is what sorts the classifications on a package card, where the reading
     * can span domains and the join has no single answer.
     *
     * Created at position zero, every question made after dimensions became
     * studio-owned would have sorted ahead of the ones a studio arranged
     * deliberately, and tied with every other new one.
     */
    const second: any = await createDimension({
      serviceDomainId: domainId, name: 'Style', question: 'What style is it in?',
    });
    const { data: rows } = await supabaseAdmin
      .from('dimensions').select('name, position')
      .eq('organization_id', TEST_ORG_ID).order('position');
    const positions = new Map(((rows || []) as any[]).map((r) => [r.name, r.position]));
    expect(
      positions.get('Style'),
      'a new question landed on top of the ones already arranged',
    ).toBeGreaterThan(positions.get('Occasion') as number);
    expect(second?.dimensionId ?? second?.id).toBeTruthy();
  });

  it('is one question the whole studio reuses, values and declarations included', async () => {
    /*
     * WHAT REUSE ACTUALLY CARRIES.
     *
     * A second domain asking Occasion does not get a second Occasion. It gets
     * THE Occasion — the same row, so the same answers, and the same
     * declarations of what follows from them. That is the whole difference
     * between a question owned by the studio and one owned by a kind of work:
     * a studio that starts filming birthdays does not retype the list of
     * occasions, nor re-declare that an occasion has a date.
     *
     * It also keeps its wording. Adopting a question does not overwrite what
     * the studio wrote when it first asked it.
     */
    const { data: videography } = await supabaseAdmin
      .from('service_domains')
      .insert({ organization_id: TEST_ORG_ID, name: 'Videography' })
      .select('id').single();

    const adopted: any = await createDimension({
      serviceDomainId: videography!.id,
      name: 'Occasion',
      question: 'Something else entirely',
    });
    const adoptedId = adopted?.dimensionId ?? adopted?.id;

    expect(adoptedId, 'adopting a question made a second one instead').toBe(occasionId);

    const { data: row } = await supabaseAdmin
      .from('dimensions').select('question').eq('id', occasionId).single();
    expect(
      row!.question,
      'adopting a question overwrote the wording the studio gave it',
    ).toBe('What occasion is it for?');

    // Both domains ask it, and there is still exactly one of it.
    const { data: asks } = await supabaseAdmin
      .from('service_domain_dimensions').select('service_domain_id').eq('dimension_id', occasionId);
    expect((asks || []).length).toBe(2);

    const { count: copies } = await supabaseAdmin
      .from('dimensions').select('id', { count: 'exact', head: true })
      .eq('organization_id', TEST_ORG_ID).eq('name', 'Occasion');
    expect(copies, 'the studio ended up with two questions of one name').toBe(1);
  });

  it('reorders for the studio, and the domain list follows', async () => {
    /*
     * ONE ORDER, WHICH IS THE POINT.
     *
     * There were two — a per-domain one the settings screen read, and the
     * studio's own that the package page read — and a third surface, the card,
     * read neither. A studio arranging its questions in settings changed only
     * settings.
     *
     * A domain asks a subset, and a subset needs no order of its own: one list,
     * filtered, renders every subset correctly.
     */
    const before = await listDimensionsForDomain(domainId);
    expect(before.length, 'nothing to reorder').toBeGreaterThan(1);
    const second = before[1];

    await moveDimension({ dimensionId: second.id, direction: 'up' });

    const after = await listDimensionsForDomain(domainId);
    expect(
      after[0].id,
      'moving a question up did not move it in the list the studio reads',
    ).toBe(second.id);

    // And back, so the move is a swap rather than a one-way renumbering.
    await moveDimension({ dimensionId: second.id, direction: 'down' });
    const restored = await listDimensionsForDomain(domainId);
    expect(restored.map((d) => d.id)).toEqual(before.map((d) => d.id));
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

  /*
   * NARROWING IS ANSWERING, PARTIALLY.
   *
   * The same movement as everything else here: a domain declares five
   * occasions, a package narrows to some, a booking is for one. Which means
   * "which occasion?" needs no flag of its own — the shape of the narrowing
   * already carries it, and these three tests are the whole rule.
   */
  it('asks which one when the package narrowed to several', async () => {
    await addDimensionValue({ dimensionId: occasionId, name: 'Anniversary' });
    const { data: anniversary } = await supabaseAdmin
      .from('dimension_values').select('id')
      .eq('dimension_id', occasionId).eq('name', 'Anniversary').single();

    const pkg = await createPackage({
      name: 'Either Occasion', serviceIds: [serviceId],
      narrowings: [
        { serviceId, valueId: birthdayId },
        { serviceId, valueId: anniversary!.id },
      ],
    });

    const open = await getOpenClassificationsForPackagePublic(TEST_ORG_ID, pkg.packageId);
    const occasion = open.find((c: any) => c.dimensionId === occasionId);
    expect(occasion, 'a package offering two occasions asked nobody which').toBeTruthy();
    expect(occasion!.values.map((v: any) => v.name).sort()).toEqual(['Anniversary', 'Birthday']);
  });

  it('asks nothing when the package narrowed to one, because that IS the answer', async () => {
    const pkg = await createPackage({
      name: 'Birthdays Only', serviceIds: [serviceId],
      narrowings: [{ serviceId, valueId: birthdayId }],
    });
    const open = await getOpenClassificationsForPackagePublic(TEST_ORG_ID, pkg.packageId);
    expect(
      open.map((c: any) => c.dimensionId),
      'a settled classification was put to the client as a question',
    ).not.toContain(occasionId);
  });

  /**
   * The id of a value, creating it if this suite has not already.
   *
   * addDimensionValue answers { ok: true } and not the row, so the id is read
   * back rather than assumed — a test that seeded with an undefined id once
   * blamed the product for an insert that had silently done nothing.
   *
   * Written this way so these cases do not depend on an earlier case in the
   * file having run and left Anniversary behind.
   */
  const valueIdNamed = async (name: string) => {
    const { data: found } = await supabaseAdmin
      .from('dimension_values').select('id')
      .eq('dimension_id', occasionId).eq('name', name).maybeSingle();
    if (found?.id) return found.id as string;
    await addDimensionValue({ dimensionId: occasionId, name });
    const { data: made } = await supabaseAdmin
      .from('dimension_values').select('id')
      .eq('dimension_id', occasionId).eq('name', name).maybeSingle();
    expect(made?.id, `could not seed the value ${name}`).toBeTruthy();
    return made!.id as string;
  };

  /*
   * THE OPERATOR IS ASKED WHAT THE CLIENT IS ASKED.
   *
   * Everything above was reachable from the storefront and from nowhere else.
   * getOpenVariablesForPackagePublic and getOpenClassificationsForPackagePublic
   * had exactly one caller between them — the public booking page — so a studio
   * taking the same booking over the telephone was asked none of it, and the
   * booking arrived with every deliberately deferred question unanswered and
   * nowhere to answer it.
   *
   * These pin the two contracts the operator's form now stands on: that one
   * call returns both halves, and that settling a classification works from a
   * session rather than only from an org id handed in by a page with no session.
   */
  it('answers both halves of what a package leaves open, in one call', async () => {
    const pkg = await createPackage({
      name: 'Asked Of Whoever Is Taking It', serviceIds: [serviceId],
      narrowings: [{ serviceId, valueId: birthdayId }, { serviceId, valueId: await valueIdNamed('Anniversary') }],
    });

    const both: any = await getOpenQuestionsForPackage(pkg.packageId);
    const viaPublic = await getOpenClassificationsForPackagePublic(TEST_ORG_ID, pkg.packageId);

    expect(both.classifications.map((c: any) => c.dimensionId).sort())
      .toEqual(viaPublic.map((c: any) => c.dimensionId).sort());
    expect(
      both.classifications.find((c: any) => c.dimensionId === occasionId),
      'the operator was not asked which occasion, though the client would be',
    ).toBeTruthy();
    expect(Array.isArray(both.variables), 'the variables half is missing').toBe(true);
  });

  it('settles a classification from a session, with no org handed in', async () => {
    // The operator path. The public page names the studio because a visitor has
    // no session; requiring it here would mean shipping the org id to the
    // browser, or a second function differing by one line.
    const pkg = await createPackage({
      name: 'Settled By An Operator', serviceIds: [serviceId],
      narrowings: [{ serviceId, valueId: birthdayId }, { serviceId, valueId: await valueIdNamed('Anniversary') }],
    });

    await answerPackageClassifications({
      packageId: pkg.packageId, valueIds: [await valueIdNamed('Anniversary')],
    });

    const read: any = await getPackage(pkg.packageId);
    const names = (read.services[0].narrowedTo || []).flatMap((d: any) => d.values.map((v: any) => v.name));
    expect(names, 'the operator answer did not settle the package').toEqual(['Anniversary']);

    const still: any = await getOpenQuestionsForPackage(pkg.packageId);
    expect(
      still.classifications.map((c: any) => c.dimensionId),
      'still asking after the operator answered',
    ).not.toContain(occasionId);
  });

  it('the answer narrows the booking own copy of the package', async () => {
    await addDimensionValue({ dimensionId: occasionId, name: 'Convocation' });
    const { data: convocation } = await supabaseAdmin
      .from('dimension_values').select('id')
      .eq('dimension_id', occasionId).eq('name', 'Convocation').single();

    const pkg = await createPackage({
      name: 'Booked Instance', serviceIds: [serviceId],
      narrowings: [
        { serviceId, valueId: birthdayId },
        { serviceId, valueId: convocation!.id },
      ],
    });

    await answerPackageClassifications({
      packageId: pkg.packageId, organizationId: TEST_ORG_ID, valueIds: [convocation!.id],
    });

    const read: any = await getPackage(pkg.packageId);
    const names = (read.services[0].narrowedTo || []).flatMap((d: any) => d.values.map((v: any) => v.name));
    expect(names, 'the chosen occasion did not settle the package').toEqual(['Convocation']);

    // And nothing is left to ask, because the range is now one.
    const open = await getOpenClassificationsForPackagePublic(TEST_ORG_ID, pkg.packageId);
    expect(open.map((c: any) => c.dimensionId), 'still asking after it was answered').not.toContain(occasionId);
  });

  /*
   * THE SAME MACHINERY, A DIFFERENT QUESTION.
   *
   * Nothing here is about occasions. A Context has an address exactly as an
   * Occasion has a date, and the only difference between the two is which
   * dimension the variable hangs off — which is what "meta-structural" has to
   * mean if it means anything. This test exists because a mechanism that only
   * ever gets exercised by the example that prompted it quietly grows
   * assumptions about that example.
   *
   * Worth noting what it makes possible: a booking has scheduled_for and
   * duration_minutes, so the app knows WHEN a job is. It has no location column
   * at all. Where a job happens has no home on a booking — and a column would
   * be null for every studio portrait ever taken. Declared on Context, it
   * exists exactly when the classification implies it.
   */
  it('does the same for a Context with an address, with nothing occasion-shaped in the way', async () => {
    const context: any = await createDimension({
      serviceDomainId: domainId, name: 'Context', question: 'Where, and under what conditions?',
    });
    const contextId = context?.dimensionId ?? context?.id;
    await addDimensionValue({ dimensionId: contextId, name: 'Outdoor' });
    const { data: outdoor } = await supabaseAdmin
      .from('dimension_values').select('id')
      .eq('dimension_id', contextId).eq('name', 'Outdoor').single();

    const declared = await declareDimensionVariable({
      dimensionId: contextId,
      // Long text, which the settings control could not offer until it stopped
      // hand-writing four of the eight kinds a variable can be.
      variable: { key: 'address', label: 'Address', kind: 'textarea' } as any,
    });
    expect(declared?.id, 'a Context could not carry an address').toBeTruthy();

    const outdoorService = await createService({
      name: 'Outdoor Portrait', serviceDomain: DOMAIN, primaryDeliverable: 'Edited image',
    });
    const { error: classifyError } = await supabaseAdmin.from('service_dimension_values').insert({
      organization_id: TEST_ORG_ID, service_id: outdoorService.serviceId, dimension_value_id: outdoor!.id,
    });
    if (classifyError) throw new Error(classifyError.message);

    const pkg = await createPackage({ name: 'Outdoor Session', serviceIds: [outdoorService.serviceId] });
    const all = await getPackageVariablesPublic(TEST_ORG_ID, pkg.packageId);
    const field = all.find((v: any) => v.id === declared!.id);
    expect(field, 'the address the Context declares did not reach a package classified Outdoor').toBeTruthy();
    expect(field!.kind).toBe('textarea');

    // And the same rule governs it: inherited, not yet asked.
    const asked = await getOpenVariablesForPackagePublic(TEST_ORG_ID, pkg.packageId);
    expect(asked.map((v: any) => v.id)).not.toContain(declared!.id);

    await updatePackage({
      packageId: pkg.packageId,
      variableValues: [{ serviceVariableId: declared!.id, answeredBy: 'client' }],
    });
    const nowAsked = await getOpenVariablesForPackagePublic(TEST_ORG_ID, pkg.packageId);
    expect(
      nowAsked.map((v: any) => v.id),
      'the client is not asked where an outdoor shoot happens',
    ).toContain(declared!.id);
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
