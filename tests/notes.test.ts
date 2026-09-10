import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * THE STUDIO'S OWN WORKING MEMORY.
 *
 * Everything else this app writes down is written down ABOUT something — a
 * booking's brief, a client's notes, an invoice's notes, an attendance note.
 * Each is a text column on the row that needed it. What had nowhere to live is
 * the rest: ring the framer about 20x30 stock, the second shooter is away in
 * June, what to say in the follow-up.
 *
 * What is pinned here is the behaviour that is easy to get wrong and invisible
 * when it is: that an empty note is allowed (a person clicks New and then
 * types, and refusing until there are words loses the thought), that saving
 * moves a note to the top (the list is ordered by it, so a save that did not
 * would look like a save that failed), and that a note belongs to its studio.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'notes', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'notes', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import {
  listNotes, getNote, createNote, updateNote, setNotePinned, setNoteColour,
  setNoteReminder, listNoteRemindersInRange, deleteNote, listNotesAbout, setNoteAbout,
} from '@/modules/notes/domain';
import { createBooking } from '@/modules/bookings/domain';
import { seedStudio } from './seed';
import { PURGE_ORDER } from './purge';

describe('the notes a studio keeps', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Notes Studio' });
  }, 120000);

  afterAll(async () => {
    await supabaseAdmin.from('notes').delete().eq('organization_id', TEST_ORG_ID);
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('starts empty, and an empty note is allowed', async () => {
    expect(await listNotes(), 'a new studio already has notes').toEqual([]);

    /*
     * The normal way to start: click New, then type. Refusing until there are
     * words would mean the first thing the app does with a thought is lose it.
     */
    const { noteId } = await createNote();
    const made = await getNote(noteId);
    expect(made, 'an empty note was refused').toBeTruthy();
    expect(made!.body, 'an empty note did not come back empty').toBe('');
    expect(made!.title, 'a note invented a title').toBeNull();
    expect(made!.pinned, 'a new note arrived pinned').toBe(false);
    // Attributed, so a studio with two people can tell who wrote what.
    expect(made!.authorName, 'the note was not attributed to whoever wrote it').toBeTruthy();
  }, 60000);

  it('saves what was typed, and moves it to the top', async () => {
    const first = await createNote({ body: 'Older thought' });
    // Distinct timestamps: the ordering being tested is by the second.
    await new Promise((r) => setTimeout(r, 1100));
    const second = await createNote({ body: 'Newer thought' });

    let all = await listNotes();
    expect(all[0].id, 'the newest note was not first').toBe(second.noteId);

    await new Promise((r) => setTimeout(r, 1100));
    await updateNote({ id: first.noteId, body: 'Older thought, edited' });

    all = await listNotes();
    expect(all[0].id, 'saving a note did not move it to the top').toBe(first.noteId);
    expect(all[0].body, 'the edit was not saved').toBe('Older thought, edited');
  }, 90000);

  it('keeps pinned notes above the rest, however old', async () => {
    const older = await createNote({ body: 'Pin me' });
    await new Promise((r) => setTimeout(r, 1100));
    await createNote({ body: 'Written later' });

    await setNotePinned({ id: older.noteId, pinned: true });

    const all = await listNotes();
    expect(all[0].id, 'a pinned note did not come first').toBe(older.noteId);
    expect(all[0].pinned).toBe(true);

    await setNotePinned({ id: older.noteId, pinned: false });
    const after = await listNotes();
    expect(after[0].id, 'unpinning did not put it back in order').not.toBe(older.noteId);
  }, 90000);

  it('removes one for good', async () => {
    const { noteId } = await createNote({ body: 'Temporary' });
    await deleteNote(noteId);
    expect(await getNote(noteId), 'the note survived removal').toBeNull();
  }, 60000);

  it('can be about a booking, and comes back with it', async () => {
    const { bookingId } = await createBooking({ brief: 'A job with notes on it' });

    const attached = await createNote({ body: 'Gate code is 4417', about: { type: 'booking', id: bookingId } });
    await createNote({ body: 'About nothing in particular' });

    const about = await listNotesAbout({ type: 'booking', id: bookingId });
    expect(about.length, 'the booking’s notes did not come back').toBe(1);
    expect(about[0].id).toBe(attached.noteId);
    expect(about[0].aboutType).toBe('booking');
    expect(about[0].aboutId).toBe(bookingId);

    // And the notes app still holds it — one table, not two.
    const all = await listNotes();
    expect(all.some((n) => n.id === attached.noteId),
      'a note written on a booking is missing from the notes app').toBe(true);
  }, 90000);

  it('detaching keeps the note', async () => {
    /*
     * What a note says was worth keeping whether or not it turned out to belong
     * to that booking. Taking it off sends it to the notes app; deleting is its
     * own act, and the interface asks separately for each.
     */
    const { bookingId } = await createBooking({ brief: 'Another job' });
    const { noteId } = await createNote({ body: 'Turned out to be general', about: { type: 'booking', id: bookingId } });

    await setNoteAbout({ id: noteId, about: null });

    expect((await listNotesAbout({ type: 'booking', id: bookingId })).length,
      'the note is still on the booking').toBe(0);

    const still = await getNote(noteId);
    expect(still, 'detaching destroyed the note').toBeTruthy();
    expect(still!.body, 'detaching lost what it said').toBe('Turned out to be general');
    expect(still!.aboutType, 'it still claims to be about something').toBeNull();
  }, 90000);

  it('refuses half an attachment', async () => {
    /*
     * A type with no id points nowhere; an id with no type cannot be resolved.
     * And a type this app cannot render is a note that exists and can never be
     * found — worse than one that was refused. The database says so rather than
     * trusting every caller to.
     */
    const { noteId } = await createNote({ body: 'Whole or nothing' });

    const halfType = await supabaseAdmin.from('notes')
      .update({ about_type: 'booking' }).eq('id', noteId);
    expect(halfType.error, 'a note was allowed to be about a type with no id').toBeTruthy();

    const unknownKind = await supabaseAdmin.from('notes')
      .update({ about_type: 'invoice', about_id: noteId }).eq('id', noteId);
    expect(unknownKind.error, 'a note was allowed to be about a kind nothing renders').toBeTruthy();
  }, 60000);

  it('never reaches another studio’s notes', async () => {
    /*
     * Every read and write is scoped by organization_id. A note id from
     * elsewhere has to come back as nothing rather than as somebody else's
     * working memory.
     */
    const otherOrg = randomUUID();
    const { error: seedError } = await supabaseAdmin.from('organizations')
      .insert({ id: otherOrg, name: 'Someone Else', status: 'active' });
    expect(seedError, 'could not seed the other studio').toBeFalsy();

    const { data: theirs } = await supabaseAdmin.from('notes')
      .insert({ organization_id: otherOrg, body: 'Not yours' })
      .select('id').single();

    try {
      expect(await getNote(theirs!.id), 'another studio’s note was readable').toBeNull();

      // And a write aimed at it changes nothing, rather than throwing and
      // leaving the caller believing it might have worked.
      await updateNote({ id: theirs!.id, body: 'overwritten' });
      const { data: after } = await supabaseAdmin.from('notes')
        .select('body').eq('id', theirs!.id).single();
      expect(after!.body, 'another studio’s note was edited').toBe('Not yours');
    } finally {
      await supabaseAdmin.from('notes').delete().eq('organization_id', otherOrg);
      await supabaseAdmin.from('organizations').delete().eq('id', otherOrg);
    }
  }, 90000);

  it('can be given one of the seven colours, and take it back off', async () => {
    /*
     * Colour is the operator's own — it means nothing the app decides, which is
     * why it can mean whatever the studio needs. It is its own act and its own
     * action: choosing a colour is not editing what a note says, and a note
     * that was never coloured is not a note missing something.
     */
    const { noteId } = await createNote({ body: 'Ring the framer' });
    expect((await getNote(noteId))!.colour, 'a new note arrived coloured').toBeNull();

    await setNoteColour({ id: noteId, colour: 'amber' });
    expect((await getNote(noteId))!.colour, 'the colour was not kept').toBe('amber');

    await setNoteColour({ id: noteId, colour: 'teal' });
    expect((await getNote(noteId))!.colour, 'a second colour did not replace the first').toBe('teal');

    await setNoteColour({ id: noteId, colour: null });
    expect((await getNote(noteId))!.colour, 'the colour could not be taken off').toBeNull();
  }, 90000);

  it('can be born coloured, so quick capture does not need a second write', async () => {
    const { noteId } = await createNote({ body: 'Rent goes up in November', colour: 'rose' });
    expect((await getNote(noteId))!.colour, 'the colour it was created with was dropped').toBe('rose');
  }, 60000);

  it('refuses a colour the design system has no token for', async () => {
    /*
     * The names are Lumen's seven, and the row holds a REFERENCE to the design
     * system rather than a copy of one moment of it — which is what keeps a
     * note amber in both themes. A hex, or an eighth name, is a note that
     * exists and renders as nothing: worse than one that was refused.
     */
    const { noteId } = await createNote({ body: 'Whole or nothing' });

    for (const bad of ['puce', '#FF00FF', 'AMBER', '']) {
      const { error } = await supabaseAdmin.from('notes')
        .update({ colour: bad }).eq('id', noteId);
      expect(error, `a note was allowed to be "${bad}"`).toBeTruthy();
    }

    // And every one that IS a token is accepted.
    for (const good of ['amber', 'green', 'blue', 'violet', 'teal', 'rose', 'red']) {
      const { error } = await supabaseAdmin.from('notes')
        .update({ colour: good }).eq('id', noteId);
      expect(error, `${good} is a token but was refused`).toBeFalsy();
    }
  }, 90000);

  it('can be asked to come back on a day, and told not to', async () => {
    /*
     * Not a task and not an alarm. Nothing polls this, nothing is sent, and
     * nothing is owed — the date puts the note on the calendar, which is the
     * surface that already gathers everything the studio has to be somewhere
     * for. Its own act, like colour: a date is not what the note says.
     */
    const when = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    const { noteId } = await createNote({ body: 'Ring the framer' });
    expect((await getNote(noteId))!.remindAt, 'a new note arrived with a date').toBeNull();

    await setNoteReminder({ id: noteId, remindAt: when });
    const dated = await getNote(noteId);
    expect(dated!.remindAt, 'the date was not kept').toBeTruthy();
    expect(new Date(dated!.remindAt!).toISOString()).toBe(when);
    expect(dated!.body, 'setting a date changed what the note said').toBe('Ring the framer');

    await setNoteReminder({ id: noteId, remindAt: null });
    const bare = await getNote(noteId);
    expect(bare!.remindAt, 'the date could not be taken off').toBeNull();
    expect(bare, 'taking the date off destroyed the note').toBeTruthy();
    expect(bare!.body, 'taking the date off lost what it said').toBe('Ring the framer');
  }, 90000);

  it('comes back to the calendar only inside the range it asked about', async () => {
    /*
     * What the calendar reads, a month at a time. A note whose date is outside
     * the month being looked at must not appear in it, and a note with no date
     * must never appear at all.
     */
    const base = Date.UTC(2031, 4, 15, 9, 0, 0); // a month nothing else uses
    const inside = new Date(base).toISOString();
    const outside = new Date(Date.UTC(2031, 7, 2, 9, 0, 0)).toISOString();

    const within = await createNote({ body: 'Inside the month' });
    await setNoteReminder({ id: within.noteId, remindAt: inside });

    const beyond = await createNote({ body: 'Another month entirely' });
    await setNoteReminder({ id: beyond.noteId, remindAt: outside });

    const undated = await createNote({ body: 'No date at all' });

    const from = new Date(Date.UTC(2031, 4, 1)).toISOString();
    const to = new Date(Date.UTC(2031, 5, 0, 23, 59, 59)).toISOString();
    const found = await listNoteRemindersInRange(from, to);
    const ids = found.map((n) => n.id);

    expect(ids, 'the dated note in this month is missing').toContain(within.noteId);
    expect(ids, 'a note from another month leaked in').not.toContain(beyond.noteId);
    expect(ids, 'a note with no date appeared on the calendar').not.toContain(undated.noteId);
    expect(found[0].body, 'the note came back without what it says').toBe('Inside the month');
  }, 120000);

  it('a reminder whose moment has passed is still there', async () => {
    /*
     * Working memory that forgets would not be working memory. Nothing expires
     * a note, nothing cleans one up, and a date in the past reads exactly as it
     * was written — the interface draws it differently and that is all.
     */
    const past = new Date(Date.UTC(2020, 0, 6, 9, 0, 0)).toISOString();
    const { noteId } = await createNote({ body: 'Long overdue' });
    await setNoteReminder({ id: noteId, remindAt: past });

    const still = await getNote(noteId);
    expect(still, 'a passed reminder removed the note').toBeTruthy();
    expect(new Date(still!.remindAt!).toISOString(), 'a passed reminder was cleared').toBe(past);

    const found = await listNoteRemindersInRange(
      new Date(Date.UTC(2020, 0, 1)).toISOString(),
      new Date(Date.UTC(2020, 1, 0, 23, 59, 59)).toISOString(),
    );
    expect(found.map((n) => n.id), 'a passed reminder vanished from its own month').toContain(noteId);
  }, 90000);
});
