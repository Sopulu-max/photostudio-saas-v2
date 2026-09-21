import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * INFORMATION FLOWS FROM ONE SOURCE TO EVERY READING - pinned on a complex
 * package, across every surface that reads it.
 *
 * WHY THIS FILE. A day of faults with one shape: a rule that existed, read
 * around by a second reading. A line's name read from a snapshot column on
 * two pages while six places read the instance; a draft invoice frozen while
 * the booking moved; "partly fulfilled" standing in for a set test that
 * existed; a name parsed back out of a label. Each test below is one ruling
 * followed through every surface it reaches, so a page that re-reads a rule
 * for itself fails here, not in front of the studio.
 *
 * THE PACKAGE. Two services from two domains (Event Photography with a
 * three-step workflow, Event Videography with two), a classification the
 * package settles (Occasion: Wedding) and one it leaves open (Context: Studio
 * or Outdoor), a variable the classification declares (the occasion's date)
 * and one asked only for Outdoor (the address), a service variable the
 * package fixes (8 hours) and a deliverable's variable it leaves to the
 * client (Softcopy or Hardcopy), a workflow step the package switches off, a
 * step of its own, and a promise of 200 edited photographs it can be asked
 * for more of. Then a booking of it, and everything that follows.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'flow', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'flow', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import {
  createService, declareDimensionVariable, declareServiceVariable, declareServiceDeliverable, declareServiceDeliverableVariable,
  setVariableAskedFor, saveWorkflow,
} from '@/modules/services/domain';
import { createDimension, addDimensionValue } from '@/modules/services/dimensionsAdmin';
import {
  createPackage, updatePackage, getPackage, getOpenQuestionsForPackage, listPackagesPublicWithDimensions,
} from '@/modules/packages/domain';
import { listResolvedTasksFor } from '@/modules/packages/workInternal';
import {
  createBooking, getBooking, setLineConfiguration, setBookingClassification, getLineConfigurationForm,
  addBookingExtra, updateBookingExtra, removeBookingExtra, createContractForBooking, readRequestCoverage,
} from '@/modules/bookings/domain';
import { lineNameOf } from '@/modules/bookings/lineName';
import { getBookingTasks, getBookingTeam, addToBookingTeam } from '@/modules/production/domain';
import { getBookingWork } from '@/modules/production/work';
import { readTasksSheet } from '@/modules/production/sheet';
import { createInvoiceForBooking, getInvoice, getBookingBilling } from '@/modules/finances/invoices';
import { createTransaction, settleTransaction } from '@/modules/finances/domain';
import { PURGE_ORDER } from './purge';
import { seedStudio, seedRow } from './seed';

let photoId = '', videoId = '', packageId = '', bookingId = '', lineId = '', contactId = '';
let photoDomainId = '', occasionId = '', contextId = '', weddingId = '', birthdayId = '', studioId = '', outdoorId = '';
let dateVarId = '', addressVarId = '', hoursVarId = '', typeVarId = '', editedId = '', filmId = '';
let colorgradeStepId = '';
let editorContactId = '', editorEmployeeId = '', editorRoleId = '';

const byName = async (table: string, name: string, extra: Record<string, unknown> = {}) => {
  let q = supabaseAdmin.from(table).select('id').eq('organization_id', TEST_ORG_ID).eq('name', name);
  for (const [k, v] of Object.entries(extra)) q = q.eq(k, v as any);
  const { data } = await q.single();
  return data!.id as string;
};

describe('Information flows from one source to every reading', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Flow Studio' });

    // Two services, two domains, each with its workflow declared with it.
    photoId = (await createService({
      name: 'Event Photography', serviceDomain: 'Photography', primaryDeliverable: 'Edited photographs',
      workflow: { name: 'Outdoor workflow', tasks: [
        { name: 'Shoot', roleName: 'Photographer' },
        { name: 'Colorgrade', roleName: 'Editor' },
        { name: 'Edit', roleName: 'Editor' },
      ] },
    })).serviceId;
    videoId = (await createService({
      name: 'Event Videography', serviceDomain: 'Videography', primaryDeliverable: 'Highlight film',
      workflow: { name: 'Video workflow', tasks: [
        { name: 'Shoot', roleName: 'Videographer' },
        { name: 'Edit', roleName: 'Editor' },
      ] },
    })).serviceId;
    photoDomainId = await byName('service_domains', 'Photography');
    // What each produces, declared through the service (the primary
    // deliverable names the kind; producing it is a declaration of its own).
    await declareServiceDeliverable({ serviceId: photoId, name: 'Edited photographs' });
    await declareServiceDeliverable({ serviceId: videoId, name: 'Highlight film' });
    editedId = await byName('deliverables', 'Edited photographs');
    filmId = await byName('deliverables', 'Highlight film');
    colorgradeStepId = await byName('workflow_tasks', 'Colorgrade');

    // The studio's vocabulary: two questions, one with a date, one with an
    // address asked only when the answer is Outdoor.
    occasionId = ((await createDimension({ serviceDomainId: photoDomainId, name: 'Occasion', question: 'What occasion is it for?' })) as any).dimensionId;
    await addDimensionValue({ dimensionId: occasionId, name: 'Wedding' });
    await addDimensionValue({ dimensionId: occasionId, name: 'Birthday' });
    contextId = ((await createDimension({ serviceDomainId: photoDomainId, name: 'Context', question: 'Where is it?' })) as any).dimensionId;
    await addDimensionValue({ dimensionId: contextId, name: 'Studio' });
    await addDimensionValue({ dimensionId: contextId, name: 'Outdoor' });
    // One question the whole studio reuses: offered by Videography too, so a
    // video service can be narrowed by it (a dimension is the studio's, and
    // each domain says whether it asks it).
    const videoDomainId = await byName('service_domains', 'Videography');
    await createDimension({ serviceDomainId: videoDomainId, name: 'Occasion', question: 'What occasion is it for?' });
    await createDimension({ serviceDomainId: videoDomainId, name: 'Context', question: 'Where is it?' });
    weddingId = await byName('dimension_values', 'Wedding');
    birthdayId = await byName('dimension_values', 'Birthday');
    studioId = await byName('dimension_values', 'Studio');
    outdoorId = await byName('dimension_values', 'Outdoor');
    dateVarId = (await declareDimensionVariable({ dimensionId: occasionId, variable: { key: 'date', label: 'Occasion Date', kind: 'date' } as any }))!.id;
    addressVarId = (await declareDimensionVariable({ dimensionId: contextId, variable: { key: 'address', label: 'Location Address', kind: 'text' } as any }))!.id;
    await setVariableAskedFor({ variableId: addressVarId, valueIds: [outdoorId] });
    // Both services can do either occasion, in either context.
    for (const serviceId of [photoId, videoId]) {
      for (const valueId of [weddingId, birthdayId, studioId, outdoorId]) {
        await supabaseAdmin.from('service_dimension_values').insert({ organization_id: TEST_ORG_ID, service_id: serviceId, dimension_value_id: valueId });
      }
    }

    // What varies: hours on the service, the kind of copy on the deliverable.
    hoursVarId = (await declareServiceVariable({ serviceId: photoId, variable: { key: 'hours', label: 'Hours of coverage', kind: 'number', unit: 'hour' } as any }))!.id;
    typeVarId = ((await declareServiceDeliverableVariable({ serviceId: photoId, deliverableId: editedId, variable: { label: 'Type', kind: 'choice', options: ['Softcopy', 'Hardcopy'] } })) as any).id;

    // The package: settles the occasion, leaves the context, fixes the hours,
    // leaves the type to the client, switches Colorgrade off, adds a step.
    packageId = (await createPackage({
      name: 'Complete Wedding',
      serviceIds: [photoId, videoId],
      price: { base_price: 400000, currency: 'NGN' },
      deliverables: [
        { serviceId: photoId, deliverableId: editedId, quantity: 200 },
        { serviceId: videoId, deliverableId: filmId, quantity: 1 },
      ],
      narrowings: [
        { serviceId: photoId, valueId: weddingId }, { serviceId: videoId, valueId: weddingId },
        { serviceId: photoId, valueId: studioId }, { serviceId: photoId, valueId: outdoorId },
      ],
      variableValues: [
        { serviceVariableId: hoursVarId, answeredBy: 'studio', value: 8 },
        { serviceVariableId: typeVarId, answeredBy: 'client' },
      ],
      tasks: [
        { serviceId: photoId, workflowTaskId: colorgradeStepId, isActive: false },
        { serviceId: photoId, name: 'Deliver the album', roleName: 'Editor', isActive: true },
      ],
    })).packageId;

    // A client, and an editor on the team.
    contactId = (await seedRow('contacts', { organization_id: TEST_ORG_ID, display_name: 'Ngozi Client' }, 'the client')).id;
    editorContactId = (await seedRow('contacts', { organization_id: TEST_ORG_ID, display_name: 'Ebuka Edits' }, 'the editor')).id;
    editorEmployeeId = (await seedRow('employees', { organization_id: TEST_ORG_ID, contact_id: editorContactId, status: 'active' }, 'the employee')).id;
    editorRoleId = await byName('roles', 'Editor');
    await supabaseAdmin.from('employee_roles').insert({ organization_id: TEST_ORG_ID, employee_id: editorEmployeeId, role_id: editorRoleId });
  }, 180000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('asks exactly what the package left open, and nothing it settled', async () => {
    const q = await getOpenQuestionsForPackage(packageId);
    // The occasion is settled; the context is a question with the two values the package allows.
    expect(q.classifications.map((c: any) => c.dimensionId)).toEqual([contextId]);
    expect(q.classifications[0].values.map((v: any) => v.name).sort()).toEqual(['Outdoor', 'Studio']);
    const asked = q.variables.map((v: any) => v.id);
    expect(asked, 'the occasion date is declared on the classification, so it is asked').toContain(dateVarId);
    expect(asked, 'the address applies while Outdoor is still possible').toContain(addressVarId);
    expect(asked, 'the type was left to the client').toContain(typeVarId);
    expect(asked, 'the hours were fixed by the studio').not.toContain(hoursVarId);
    // Named by the settled answer: a Wedding Date, not an Occasion Date.
    expect(q.variables.find((v: any) => v.id === dateVarId)!.label).toBe('Wedding Date');
    // And the storefront reads the same, from the same function.
    const pub = (await listPackagesPublicWithDimensions(TEST_ORG_ID)).find((p: any) => p.id === packageId);
    expect(pub, 'the package is not on the storefront').toBeTruthy();
  }, 60000);

  it('resolves the work from the workflows, with the package’s departures, and holds no copy', async () => {
    const work = [...(await listResolvedTasksFor(TEST_ORG_ID, [packageId])).values()].flat();
    const photo = work.find((w) => w.serviceName === 'Event Photography')!;
    const video = work.find((w) => w.serviceName === 'Event Videography')!;
    expect(photo.tasks.filter((t) => t.isActive).map((t) => t.name)).toEqual(['Shoot', 'Edit', 'Deliver the album']);
    expect(photo.tasks.find((t) => t.name === 'Colorgrade')!.isActive).toBe(false);
    expect(video.tasks.map((t) => t.name)).toEqual(['Shoot', 'Edit']);
    // Only the departure and the own step are rows; the workflow is read.
    const { data: rows } = await supabaseAdmin.from('package_tasks').select('name, workflow_task_id, is_active').eq('organization_id', TEST_ORG_ID);
    expect((rows || []).length, 'a package held a copy of its workflow').toBe(2);
  }, 60000);

  it('takes a booking: its answers, its own copy, its questions still open on the booking', async () => {
    const made = await createBooking({
      contactId,
      lines: [{ packageId, variableAnswers: [{ serviceVariableId: dateVarId, value: '2026-12-05' }, { serviceVariableId: typeVarId, value: 'Softcopy' }] }],
    });
    bookingId = made.bookingId;
    const booking: any = await getBooking(bookingId);
    lineId = booking.lines[0].id;
    // Its own copy, named as the catalogue package, priced as it.
    expect(booking.lines[0].package_id).not.toBe(packageId);
    expect(lineNameOf(booking.lines[0])).toBe('Complete Wedding');
    await setBookingClassification({ bookingId, dimensionId: contextId, valueId: outdoorId });
    await setLineConfiguration({ bookingId, lineId, answers: [{ serviceVariableId: addressVarId, value: 'Eko Hotel' }], source: 'client' });

    // The line reads its answers, named by them, and knows what is still open.
    const fields = await getLineConfigurationForm(lineId);
    const byId = new Map(fields.map((f: any) => [f.serviceVariableId, f]));
    expect(byId.get(dateVarId)!.label).toBe('Wedding Date');
    expect(byId.get(dateVarId)!.value).toBe('2026-12-05');
    expect(byId.get(hoursVarId)!.value, 'the package’s fixed value did not reach the line').toBe(8);
    expect(byId.get(typeVarId)!.asked).toBe(true);

    // What it is for is answered by what is on it: nothing left to resolve.
    const coverage = await readRequestCoverage(bookingId);
    expect(coverage.covered).toBe(true);
    expect(coverage.answeredBy).toEqual(['Complete Wedding']);
  }, 120000);

  it('reads the booking’s work live, and freezes nothing', async () => {
    const tasks = await getBookingTasks(bookingId);
    expect(tasks.map((t) => t.name)).toEqual(['Shoot', 'Edit', 'Deliver the album', 'Shoot', 'Edit']);
    expect(tasks.every((t) => t.id === null), 'a booking task row was written before anything happened').toBe(true);
    const work = await getBookingWork(bookingId);
    expect(work.total).toBe(5);
    expect(work.lines[0].services.map((s) => `${s.serviceName}:${s.total}`).sort()).toEqual(['Event Photography:3', 'Event Videography:2']);
    // The crew reading sees roles the booking needs before anyone is on them.
    const team = await getBookingTeam(bookingId);
    expect(team.unfilled).toBe(5);

    // Put the editor on: every Editor step is taken, through the first-touch rows.
    const added = await addToBookingTeam({ bookingId, employeeId: editorEmployeeId, roleId: editorRoleId });
    expect(added.tasksFilled).toBe(3);
    const after = await getBookingTasks(bookingId);
    expect(after.filter((t) => t.assignee?.name === 'Ebuka Edits').map((t) => t.name)).toEqual(['Edit', 'Deliver the album', 'Edit']);
    // The same facts on the tasks sheet, from the same rows: the booking's five
    // tasks, three on Ebuka, two on nobody - and the axes say so too.
    const sheet = await readTasksSheet();
    const mine = sheet.rows.filter((r) => r.booking.id === bookingId);
    expect(mine.length).toBe(5);
    expect(mine.filter((r) => r.assignee?.name === 'Ebuka Edits').length).toBe(3);
    expect(mine.filter((r) => !r.assignee).map((r) => r.name).sort()).toEqual(['Shoot', 'Shoot']);
    const person = sheet.lenses.find((g) => g.key === 'person')!;
    expect(person.items.find((it) => it.label === 'Ebuka Edits')!.count).toBe(3);
    expect(person.none).toBe('Unassigned');
    const role = sheet.lenses.find((g) => g.key === 'role')!;
    expect(role.items.map((it) => it.label).sort()).toEqual(['Editor', 'Photographer', 'Videographer']);
    // Every row says what it takes on every axis the sheet offers.
    for (const r of mine) for (const g of sheet.lenses) expect(Array.isArray(r.takes[g.key]), `${g.key} missing on a row`).toBe(true);
  }, 120000);

  it('follows a workflow change on the booking, and keeps what happened', async () => {
    const { data: wf } = await supabaseAdmin.from('workflows').select('id, service_domain_id, workflow_tasks(id, name)').eq('organization_id', TEST_ORG_ID).eq('name', 'Video workflow').single();
    const stepId = (n: string) => (wf!.workflow_tasks as any[]).find((t) => t.name === n).id as string;
    await saveWorkflow(wf!.service_domain_id, { name: 'Video workflow', tasks: [
      { id: stepId('Shoot'), name: 'Shoot', roleName: 'Videographer' },
      { id: stepId('Edit'), name: 'Edit and grade', roleName: 'Editor' },
      { name: 'Deliver the film', roleName: 'Editor' },
    ] } as any);
    const tasks = await getBookingTasks(bookingId);
    const video = tasks.filter((t) => t.fromService === 'Event Videography');
    expect(video.map((t) => t.name)).toEqual(['Shoot', 'Edit and grade', 'Deliver the film']);
    // The editor is still on the renamed step: the row is about the step, not its name.
    expect(video.find((t) => t.name === 'Edit and grade')!.assignee?.name).toBe('Ebuka Edits');
  }, 120000);

  it('an extra reaches the promise, the total, the draft, the contract - and leaves them again', async () => {
    const { invoiceId } = await createInvoiceForBooking({ bookingId });
    await createContractForBooking(bookingId);
    const photoBundle = (await getPackage((await getBooking(bookingId) as any).lines[0].package_id) as any).services.find((s: any) => s.id === photoId);

    const { id: extraId } = await addBookingExtra({ bookingLineId: lineId, packageServiceId: photoBundle.packageServiceId, deliverableId: editedId, units: 20, unitAmount: 500 });
    const reads = async () => {
      const inv: any = await getInvoice(invoiceId);
      const { data: c } = await supabaseAdmin.from('contracts').select('terms').eq('booking_id', bookingId).single();
      const pkg: any = await getPackage((await getBooking(bookingId) as any).lines[0].package_id);
      const promised = pkg.services.find((s: any) => s.id === photoId).deliverables.find((d: any) => d.id === editedId).quantity;
      return {
        draftRows: inv.lines.map((l: any) => `${l.kind}:${l.description}:${Number(l.amount)}`),
        draftTotal: inv.total,
        contractBase: Number((c!.terms as any).base_price),
        booked: (await getBookingBilling(bookingId)).booked,
        promised: Number(promised),
      };
    };
    let r = await reads();
    expect(r.draftRows).toEqual(['package:Complete Wedding · 2026-12-05 · Softcopy · Eko Hotel:400000', 'extra:+20 Edited photographs:10000']);
    expect(r.draftTotal).toBe(410000);
    expect(r.contractBase).toBe(410000);
    expect(r.booked).toBe(410000);
    expect(r.promised).toBe(220);

    await updateBookingExtra({ id: extraId, units: 30, unitAmount: 500 });
    r = await reads();
    expect(r.draftRows[1]).toBe('extra:+30 Edited photographs:15000');
    expect(r.contractBase).toBe(415000);
    expect(r.promised).toBe(230);

    await removeBookingExtra({ id: extraId });
    r = await reads();
    expect(r.draftRows).toEqual(['package:Complete Wedding · 2026-12-05 · Softcopy · Eko Hotel:400000']);
    expect(r.contractBase).toBe(400000);
    expect(r.promised).toBe(200);
  }, 180000);

  it('names the line by its instance everywhere, and the booking after it', async () => {
    const instanceId = (await getBooking(bookingId) as any).lines[0].package_id as string;
    await updatePackage({ packageId: instanceId, name: 'Complete Wedding (Ngozi)' });
    const booking: any = await getBooking(bookingId);
    expect(lineNameOf(booking.lines[0])).toBe('Complete Wedding (Ngozi)');
    expect(booking.title, 'the booking is named after what is on it').toContain('Complete Wedding (Ngozi)');
    expect((await getBookingTasks(bookingId))[0].fromPackage).toBe('Complete Wedding (Ngozi)');
    expect((await getBookingWork(bookingId)).lines[0].packageName).toBe('Complete Wedding (Ngozi)');
  }, 60000);

  it('money against a draft issues it; an issued invoice no longer moves', async () => {
    const { data: inv } = await supabaseAdmin.from('invoices').select('id, status').eq('booking_id', bookingId).single();
    expect(inv!.status).toBe('draft');
    const tx: any = await createTransaction({ kind: 'charge', type: 'Deposit', amount: 100000, currency: 'NGN', invoiceId: inv!.id, contactId, bookingId });
    await settleTransaction({ transactionId: tx.id });
    const issued: any = await getInvoice(inv!.id);
    expect(issued.status).toBe('issued');
    expect(issued.number).toMatch(/^INV-\d{4}$/);
    expect(issued.partly).toBe(true);

    // Frozen: an extra taken now does not touch it, and shows as left to invoice.
    const photoBundle = (await getPackage((await getBooking(bookingId) as any).lines[0].package_id) as any).services.find((s: any) => s.id === photoId);
    await addBookingExtra({ bookingLineId: lineId, packageServiceId: photoBundle.packageServiceId, deliverableId: editedId, units: 10, unitAmount: 500 });
    const again: any = await getInvoice(inv!.id);
    expect(again.lines.length).toBe(1);
    const billing = await getBookingBilling(bookingId);
    expect(billing.leftToInvoice).toBe(5000);
  }, 120000);
});
