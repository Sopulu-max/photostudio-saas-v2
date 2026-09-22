import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * THE BOOKINGS PAGE SAYS SOMETHING, AND KEEPS SAYING IT.
 *
 * WHY THIS FILE. The page is pure: it only draws what two reads decide, so
 * when a read narrows, a whole region goes quiet and nothing fails - the
 * operator's own words for it were "sometimes things just disappear". Every
 * region of readBookingsDashboard is pinned here against a studio seeded with
 * one booking per state the region exists to show, and every statement is
 * pinned for the words that make it readable (12-BOOKINGS_READABILITY): a verb
 * that says which plane it comes from, a numeral with the noun it counts, an
 * absence said as a clause.
 *
 * So a region that empties, or a statement that loses its verb, fails here
 * rather than in front of the studio.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({ userId: 'read', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID }),
  getOptionalAuthOrgId: async () => ({ userId: 'read', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID }),
}));

import { createService, declareDimensionVariable, declareServiceVariable, declareServiceDeliverable } from '@/modules/services/domain';
import { createDimension, addDimensionValue } from '@/modules/services/dimensionsAdmin';
import { createPackage } from '@/modules/packages/domain';
import {
  createBooking, setLineConfiguration, setBookingClassification, setBookingStage, createContractForBooking,
} from '@/modules/bookings/domain';
import { toggleTaskDone, getBookingTasks } from '@/modules/production/domain';
import { readBookingsDashboard } from '@/modules/bookings/dashboard';
import { readBookingsRegister } from '@/modules/bookings/register';
import {
  sayNeeds, saySession, sayWork, sayPositions, sayProgress, sayAbsence, sayDay, flat,
  cardName, cardWhat, cardWhen, cardNeeds,
} from '@/modules/bookings/say';
import { PURGE_ORDER } from './purge';
import { seedStudio, seedRow } from './seed';

const byName = async (table: string, name: string) => {
  const { data } = await supabaseAdmin.from(table).select('id').eq('organization_id', TEST_ORG_ID).eq('name', name).limit(1).maybeSingle();
  return (data as any)?.id as string;
};
const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

describe('The bookings page says something, and keeps saying it', () => {
  let serviceId: string, packageId: string, occasionId: string, contextId: string;
  let weddingId: string, birthdayId: string, studioId: string, outdoorId: string, dateVarId: string, outfitsVarId: string, photographsId: string;
  let bareId: string, todayId: string, heldId: string, proposedId: string, bookedId: string;
  let enquiryStageId: string, bookedStageId: string;

  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Readable Studio' });
    enquiryStageId = await byName('booking_stages', 'Enquiry');
    bookedStageId = await byName('booking_stages', 'Booked');

    serviceId = (await createService({
      name: 'Portrait Photography', serviceDomain: 'Photography', primaryDeliverable: 'Edited photographs',
      workflow: { name: 'Studio workflow', tasks: [{ name: 'Shoot', roleName: 'Photographer' }, { name: 'Edit', roleName: 'Editor' }] },
    })).serviceId;
    const domainId = await byName('service_domains', 'Photography');

    // The studio's own vocabulary: one dimension the package settles, one it leaves open.
    occasionId = ((await createDimension({ serviceDomainId: domainId, name: 'Occasion', question: 'What is it for?' })) as any).dimensionId;
    await addDimensionValue({ dimensionId: occasionId, name: 'Wedding' });
    await addDimensionValue({ dimensionId: occasionId, name: 'Birthday' });
    contextId = ((await createDimension({ serviceDomainId: domainId, name: 'Context', question: 'Where is it?' })) as any).dimensionId;
    await addDimensionValue({ dimensionId: contextId, name: 'Studio' });
    await addDimensionValue({ dimensionId: contextId, name: 'Outdoor' });
    weddingId = await byName('dimension_values', 'Wedding');
    birthdayId = await byName('dimension_values', 'Birthday');
    studioId = await byName('dimension_values', 'Studio');
    outdoorId = await byName('dimension_values', 'Outdoor');
    for (const valueId of [weddingId, birthdayId, studioId, outdoorId]) {
      await supabaseAdmin.from('service_dimension_values').insert({ organization_id: TEST_ORG_ID, service_id: serviceId, dimension_value_id: valueId });
    }
    // What the service produces, so a package can promise a quantity of it.
    await declareServiceDeliverable({ serviceId, name: 'Edited photographs' });
    photographsId = await byName('deliverables', 'Edited photographs');

    // A date the occasion declares - a calendar fact that is not the session - and a quantity.
    dateVarId = (await declareDimensionVariable({ dimensionId: occasionId, variable: { key: 'date', label: 'Occasion Date', kind: 'date' } as any }))!.id;
    outfitsVarId = (await declareServiceVariable({ serviceId, variable: { key: 'outfits', label: 'Number of outfits', kind: 'number', unit: 'outfit' } as any }))!.id;

    packageId = (await createPackage({
      name: 'Standard Portrait Session',
      serviceIds: [serviceId],
      price: { base_price: 100000, currency: 'NGN' },
      narrowings: [
        { serviceId, valueId: weddingId }, { serviceId, valueId: birthdayId },   // left open: two values
        { serviceId, valueId: studioId },                                        // settled
      ],
      variableValues: [{ serviceVariableId: outfitsVarId, answeredBy: 'client' }],
      deliverables: [{ serviceId, deliverableId: photographsId, quantity: 4 }],
    })).packageId;

    const client = await seedRow('contacts', { organization_id: TEST_ORG_ID, display_name: 'Ada Client' }, 'a client');

    // 1. A job with nothing on it: no client, no package, no date, no proposal.
    bareId = (await createBooking({ title: 'Walk-in enquiry' })).bookingId;

    // 2. A session today, with a package and its quantity answered.
    const todayBooking = await createBooking({
      contactId: client.id, scheduledFor: `${day(0)}T11:00:00Z`,
      lines: [{ packageId }],
    });
    todayId = todayBooking.bookingId;
    const todayLine = (await supabaseAdmin.from('booking_lines').select('id').eq('booking_id', todayId).limit(1).maybeSingle()).data as any;
    await setLineConfiguration({ bookingId: todayId, lineId: todayLine.id, answers: [{ serviceVariableId: outfitsVarId, value: 2 }] });
    await setBookingClassification({ bookingId: todayId, dimensionId: occasionId, valueId: birthdayId });
    await setBookingClassification({ bookingId: todayId, dimensionId: contextId, valueId: studioId });

    // 3. A session held two days ago with its steps still open: post-production.
    const heldBooking = await createBooking({
      contactId: client.id, scheduledFor: `${day(-2)}T10:00:00Z`, lines: [{ packageId }],
    });
    heldId = heldBooking.bookingId;
    await setBookingStage({ bookingId: heldId, stageId: bookedStageId });
    const heldLine = (await supabaseAdmin.from('booking_lines').select('id').eq('booking_id', heldId).limit(1).maybeSingle()).data as any;
    await setBookingClassification({ bookingId: heldId, dimensionId: occasionId, valueId: weddingId });
    // The occasion's own date, three days after the session - a second dated fact on the job.
    await setLineConfiguration({ bookingId: heldId, lineId: heldLine.id, answers: [{ serviceVariableId: dateVarId, value: day(3) }] });
    // One of the two steps done, so the job reads as in post-production rather than untouched.
    const shoot = (await getBookingTasks(heldId)).find((t: any) => t.name === 'Shoot')!;
    await toggleTaskDone({ bookingId: heldId, task: (shoot as any).ref });

    // 4. A job with a proposal out: the move is the client's.
    proposedId = (await createBooking({ contactId: client.id, scheduledFor: `${day(9)}T09:00:00Z`, lines: [{ packageId }] })).bookingId;
    await createContractForBooking(proposedId);

    // 5. A booked job with a session ahead and nobody on its steps.
    bookedId = (await createBooking({ contactId: client.id, scheduledFor: `${day(4)}T14:00:00Z`, lines: [{ packageId }] })).bookingId;
    await setBookingStage({ bookingId: bookedId, stageId: bookedStageId });
  }, 240000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  }, 120000);

  /* ─────────── every region says something, and says what it is about ─────────── */

  it('says what is happening today, with the time and where the work stands', async () => {
    const dash = await readBookingsDashboard(30);
    const row = dash.today.find((n) => n.booking.id === todayId);
    expect(row, 'a session dated today is in the today region').toBeTruthy();

    const said = flat(saySession(row!.booking, row!.crew, dash.sheet.today));
    expect(said).toMatch(/Shoots at \d{2}:\d{2}/);            // the verb carries the plane
    expect(said).toMatch(/No personnel assigned|Personnel:/);  // the crew, said either way
    expect(said).not.toMatch(/undefined|NaN|null/);
  });

  it('says what each job still needs, as a clause naming every absence', async () => {
    const dash = await readBookingsDashboard(30);
    const bare = dash.sheet.bands.flatMap((b) => b.rows).find((r) => r.id === bareId)!;
    const said = flat(sayNeeds(bare, dash.sheet.today));

    // One clause, every absence in it, in the order a job resolves them.
    expect(said).toContain('No client recorded, no package recorded, no session date and no proposal issued.');
    // And it states the consequence rather than leaving a blank.
    expect(said).toContain('Nothing is committed and no work is defined.');

    // The absence totals are whole sentences with the noun attached, never a bare numeral.
    const dateTotal = dash.attention.find((a) => a.key === 'date')!;
    expect(dateTotal.count).toBeGreaterThan(0);
    expect(flat(sayAbsence('date', dateTotal.count))).toMatch(/bookings? (has|have) no session date/);
    // And the sentence agrees with its own count, either way.
    expect(flat(sayAbsence('date', 1))).toContain('1 booking has no session date');
    expect(flat(sayAbsence('date', 4))).toContain('4 bookings have no session date');
    expect(flat(sayAbsence('decision-client', 1))).toContain('is awaiting a client response');
    expect(flat(sayAbsence('decision-client', 3))).toContain('are awaiting a client response');
  });

  it('says where the work is: the next step, who holds it, and how far along', async () => {
    const dash = await readBookingsDashboard(30);
    const post = dash.works.find((w) => w.booking.id === heldId);
    expect(post, 'a booked job with a held session and open steps is in post-production').toBeTruthy();

    const said = flat(sayWork(post!.booking, dash.sheet.today));
    expect(said).toMatch(/Shot /);                       // past tense: the session is behind
    expect(said).toContain('Edit');                      // the step that is next, by name
    expect(said).toMatch(/unassigned|assigned to /);     // who holds it, or that nobody is on it
    expect(sayProgress(post!.booking)).toBe('1 of 2 steps done');

    // What the studio is short of, by its own role names.
    expect(dash.roleTotals.length).toBeGreaterThan(0);
    expect(dash.roleTotals.map((r) => r.name)).toContain('Editor');
  });

  it('says when everything is, one day at a time, with the occasion told apart from the session', async () => {
    const dash = await readBookingsDashboard(30);
    const today = dash.dated.days.find((d) => d.today);
    expect(today, "today is a day in the dated reading").toBeTruthy();
    expect(flat(today!.lines[0].say)).toMatch(/shoots at \d{2}:\d{2}/);

    // The occasion's own date is three days ahead, and says how it sits against the shoot.
    const occasionDay = dash.dated.days.find((d) => d.day === day(3));
    expect(occasionDay, 'a date-kind answer puts the job on its own day').toBeTruthy();
    const said = flat(occasionDay!.lines[0].say);
    /*
     * The label is the booking's own: the job said Wedding, so the occasion's
     * date reads as the Wedding Date (kernel labelledByAnswer, doc 11 §2.4).
     * The page composes whatever the row carries and never the package's word.
     */
    expect(said).toContain('Wedding Date');
    expect(said).not.toContain('Occasion Date');
    expect(said).toContain("Ada Client's job");
    expect(said).toBe("Wedding Date on Ada Client's job. 5 days after the shoot.");

    // A job with no date is counted, not drawn - and the count carries its noun.
    expect(dash.dated.undated).toBeGreaterThan(0);
    expect(dash.dated.ahead).toBeGreaterThan(0);

    /*
     * THE AXIS is every day of the window, whether anything falls on it or
     * not: that is what makes a collision and a quiet week readable (Law 4).
     */
    expect(dash.dated.columns).toHaveLength(61);
    expect(dash.dated.columns[30].today).toBe(true);
    expect(dash.dated.columns[0].behind).toBe(true);
    expect(dash.dated.columns[60].behind).toBe(false);
    // The session two days back sits on its own column, named.
    const back = dash.dated.columns.find((c) => c.day === day(-2))!;
    expect(back.sessions).toContain('Ada Client');
    // The occasion three days ahead sits on its own, and says whose job it is.
    const ahead = dash.dated.columns.find((c) => c.day === day(3))!;
    expect(ahead.occasions.join(' ')).toContain("Ada Client's job");
    // Every column of a quiet day is empty rather than absent.
    expect(dash.dated.columns.filter((c) => c.sessions.length === 0).length).toBeGreaterThan(50);
    // And the same window by week, each week labelled with its own date and count.
    expect(dash.dated.weeks).toHaveLength(8);
    expect(dash.dated.weeks.find((w) => w.label.startsWith('this week'))).toBeTruthy();
    expect(dash.dated.weeks.reduce((n, w) => n + w.count, 0)).toBeGreaterThan(0);
  });

  it('says what the book has sold, and how far each question has been answered', async () => {
    const dash = await readBookingsDashboard(30);
    const pkg = dash.sold.packages.find((p) => p.name.includes('Standard Portrait Session'));
    expect(pkg?.jobs).toBe(4); // every job that carries the package, live

    const outfits = dash.sold.questions.find((q) => q.label === 'Number of outfits');
    expect(outfits?.answered).toBe(1);
    expect(outfits?.said).toBe('2 outfits'); // the quantity with the studio's unit

    // Keyed by the label the booking uses, which is the one the operator would recognise.
    const occasion = dash.sold.questions.find((q) => q.label === 'Wedding Date');
    expect(occasion?.answered).toBe(1);
    expect(occasion?.next?.day).toBe(day(3));
    expect(occasion?.next?.name).toBe('Ada Client');
  });

  it('says what the book is for, in the studio\'s own dimensions, and what it leaves open', async () => {
    const dash = await readBookingsDashboard(30);
    const occasion = dash.forDimensions.find((d) => d.name === 'Occasion')!;
    expect(occasion.values.map((v) => v.name).sort()).toEqual(['Birthday', 'Wedding']);
    expect(occasion.values.find((v) => v.name === 'Birthday')!.jobs).toBe(1);
    // Two jobs carry the package and have not answered the occasion it leaves open.
    expect(occasion.open).toBeGreaterThan(0);

    const context = dash.forDimensions.find((d) => d.name === 'Context')!;
    expect(context.values.find((v) => v.name === 'Studio')!.jobs).toBe(1);
  });

  it('says where the studio says everything is, and whose move the decision is', async () => {
    const dash = await readBookingsDashboard(30);
    const stages = dash.pipeline.filter((s) => s.count > 0).map((s) => s.label);
    expect(stages).toContain('Enquiry');
    expect(stages).toContain('Booked');

    expect(dash.decision.awaitingClient).toBe(1);                 // the proposal out
    expect(dash.decision.awaitingStudio).toBeGreaterThan(0);      // enquiries with no proposal
    // Two jobs were moved to a booked stage and no contract ever went active: the planes disagree.
    expect(dash.decision.bookedWithoutAgreement).toBe(2);
  });

  it('says how the book moved, and what changed', async () => {
    const dash = await readBookingsDashboard(30);
    expect(dash.sheet.figures.find((f) => f.key === 'new')!.value).toBe(5);
    expect(dash.recent.length).toBeGreaterThan(0);
    expect(dash.recent[0].phrase).toBeTruthy();
  });

  it('gives every card the same four lines, so a column of them scans as a set', async () => {
    const dash = await readBookingsDashboard(30);
    const rows = dash.sheet.bands.flatMap((b) => b.rows).filter((r) => r.band !== 'closed');
    const today = dash.sheet.today;

    /*
     * THE BOARD's card is a fixed shape (components/Board): who it is for, what
     * it is, when it is, and the ONE thing it most needs. Every line is the
     * same kind of fact on every card, and "when" is never blank - a job with
     * no date says so, because that is the fact.
     */
    for (const r of rows) {
      expect(cardName(r), `${r.title} has no name on its card`).toBeTruthy();
      const when = cardWhen(r, today);
      expect(when).toBeTruthy();
      expect(when).not.toMatch(/undefined|NaN|Invalid/);
      if (!r.day) expect(when).toBe('no date yet');
      const what = cardWhat(r);
      if (r.packages.length > 0) expect(what).toBe(r.packages.join(' · '));
    }

    // The job with nothing on it leads with the absence a studio resolves first.
    const bare = rows.find((r) => r.id === bareId)!;
    expect(cardNeeds(bare)).toBe('No client recorded');
    expect(cardWhen(bare, today)).toBe('no date yet');

    // Today's session says the time, not the date.
    const now = rows.find((r) => r.id === todayId)!;
    expect(cardWhen(now, today)).toMatch(/^today at \d{2}:\d{2}$/);

    /*
     * A job with a proposal out AND a step nobody is on leads with the step:
     * the step is the studio's own gap, while the proposal is the client's
     * move. The card shows one absence, so which one it shows is a ruling -
     * the same order the page sorts by (RESOLVE), crew before decision-client.
     */
    const proposed = rows.find((r) => r.id === proposedId)!;
    expect(cardNeeds(proposed)).toBe('2 steps unassigned');

    // And every card sits in a column of every axis the board can be read by.
    for (const key of ['when', 'stage', 'needs', 'missing']) {
      const axis = dash.sheet.lenses.find((g) => g.key === key)!;
      expect(axis, `the board cannot be grouped by ${key}`).toBeTruthy();
      for (const r of rows) {
        const takes = r.takes[key] ?? [];
        // Either it takes a value on the axis, or the axis names the rows that take none.
        expect(takes.length > 0 || Boolean(axis.none), `${r.title} falls out of the ${key} board`).toBe(true);
      }
    }
  });

  it('gives the register a row per booking, with the three facts the sheet does not carry', async () => {
    const reg = await readBookingsRegister(30);
    expect(reg.rows).toHaveLength(5);

    /*
     * COMMITTED is the promise, read through the package instance: the package
     * promises 4 edited photographs, so every booking carrying it owes 4. A
     * booking with no package promises nothing - which is not zero of
     * something, but nothing at all.
     */
    const withPackage = reg.rows.find((r) => r.id === todayId)!;
    expect(withPackage.committed).toEqual([
      { deliverable: 'Edited photographs', quantity: 4, extra: 0, undecided: false },
    ]);
    const bare = reg.rows.find((r) => r.id === bareId)!;
    expect(bare.committed).toEqual([]);
    expect(bare.packages).toEqual([]);

    // PERSONNEL is the declared crew, which nothing in this studio has assigned yet.
    for (const r of reg.rows) expect(Array.isArray(r.personnel)).toBe(true);
    expect(withPackage.personnel).toEqual([]);

    /*
     * LAST MOVED comes from the events log, which is the only record of a
     * transition: every booking here was created, so every row has one.
     */
    for (const r of reg.rows) {
      expect(r.lastActivity, `${r.title} has no recorded activity`).toBeTruthy();
      expect(new Date(r.lastActivity!.at).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }
    /*
     * The NEWEST event wins, not the first: the held booking was created, then
     * moved to a booked stage, then classified, so its last movement is the
     * classification - which is what "last moved" has to mean for the column
     * to be worth reading.
     */
    const held = reg.rows.find((r) => r.id === heldId)!;
    expect(held.lastActivity!.action).toBe('classification_changed');
    expect(bare.lastActivity!.action).toBe('created');

    // And everything the columns read of the sheet is still on the row.
    expect(withPackage.takes.stage?.length).toBe(1);
    expect(withPackage.work?.total).toBe(2);
    expect(reg.sheet.lenses.map((g) => g.key)).toContain('missing');
  });

  it('counts a promise the package left open without counting it as none', async () => {
    const reg = await readBookingsRegister(30);
    const row = reg.rows.find((r) => r.id === proposedId)!;
    const promise = row.committed.find((c) => c.deliverable === 'Edited photographs')!;
    expect(promise.quantity).toBe(4);
    // Nothing was added on this booking, and the number was not left to anybody.
    expect(promise.extra).toBe(0);
    expect(promise.undecided).toBe(false);
  });

  /* ─────────── the readability laws, pinned ─────────── */

  it('never says a number without the noun it counts, and never leaves a statement empty', async () => {
    const dash = await readBookingsDashboard(30);
    const rows = dash.sheet.bands.flatMap((b) => b.rows);

    for (const r of rows) {
      const needs = flat(sayNeeds(r, dash.sheet.today));
      expect(needs.length, `${r.title} says nothing about what it needs`).toBeGreaterThan(0);
      for (const said of [needs, flat(sayPositions(r)), flat(sayWork(r, dash.sheet.today))]) {
        expect(said, `${r.title}: a hole in a statement`).not.toMatch(/undefined|NaN|\bnull\b/);
        // A bare numeral at the end of a clause means the noun was dropped.
        expect(said, `${r.title}: a numeral with no noun`).not.toMatch(/\b\d+\s*[.,]/);
      }
    }
    for (const q of dash.sold.questions) if (q.said) expect(q.said).not.toMatch(/^\d+$|undefined|NaN/);
  });

  it('never addresses the reader, and never says nobody', async () => {
    /*
     * PLAIN PROFESSIONAL BUSINESS LANGUAGE, ruled more than once: the page
     * reports the state of the record. It does not speak to the operator
     * ("waiting on you"), and it does not say "nobody" where a record simply
     * names no one - the term is unassigned.
     */
    const dash = await readBookingsDashboard(30);
    const rows = dash.sheet.bands.flatMap((b) => b.rows);
    const said: string[] = [];
    for (const r of rows) {
      said.push(flat(sayNeeds(r, dash.sheet.today)), flat(sayWork(r, dash.sheet.today)), flat(sayPositions(r)), cardNeeds(r) ?? '');
    }
    for (const m of ['lapsed', 'decision-studio', 'decision-client', 'reminder', 'client', 'date', 'package', 'classification', 'crew']) {
      said.push(flat(sayAbsence(m, 1)), flat(sayAbsence(m, 3)));
    }
    for (const t of said) {
      expect(t, `second person in: ${t}`).not.toMatch(/(you|your|yours)/i);
      expect(t, `"nobody" in: ${t}`).not.toMatch(/nobody/i);
    }
  });

  it('says a date with the distance that makes it legible, and never a bare date', async () => {
    const today = day(0);
    expect(sayDay(today, today)).toMatch(/^today, /);
    expect(sayDay(day(1), today)).toMatch(/^tomorrow, /);
    expect(sayDay(day(-1), today)).toMatch(/^yesterday, /);
    expect(sayDay(day(4), today)).toMatch(/, in 4 days$/);
    expect(sayDay(day(-16), today)).toMatch(/, 16 days ago$/);
    // The day itself is said in words, so it needs no column to say which date it is.
    expect(sayDay(day(4), today)).toMatch(/[A-Z][a-z]+day/);
  });

  it('keeps the studio\'s words verbatim, and pluralises only the app\'s own nouns', async () => {
    const dash = await readBookingsDashboard(30);
    const post = dash.works.find((w) => w.booking.id === heldId)!;
    const said = flat(sayWork(post.booking, dash.sheet.today));
    // The service and step names are the studio's: they appear exactly as declared.
    expect(said).toContain('Portrait Photography');
    expect(said).toContain('Edit');
    expect(said).not.toContain('Edits');
    expect(said).not.toContain('Portrait Photographys');
    // The app's own nouns do inflect, because a numeral must carry one.
    expect(sayProgress(post.booking)).toContain('steps');
  });
});
