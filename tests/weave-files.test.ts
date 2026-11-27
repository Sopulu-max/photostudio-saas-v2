import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { saySize, sayFiles, isImage, type StudioFile } from '@/weave/files/shape';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    db: { schema: 'weave' },
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  },
);

let studioId: string;
let bookingId: string;
let personId: string;

beforeAll(async () => {
  const { data: studio, error } = await db
    .from('studios').insert({ name: `Test Studio ${Date.now()}` }).select('id').single();
  if (error) throw error;
  studioId = studio.id;

  const { data: person } = await db
    .from('people').insert({ studio_id: studioId, name: 'Test Person' }).select('id').single();
  personId = person!.id;

  const { data: booking } = await db
    .from('bookings').insert({ studio_id: studioId }).select('id').single();
  bookingId = booking!.id;
});

afterAll(async () => {
  if (studioId) await db.from('studios').delete().eq('id', studioId);
});

describe('files', () => {
  it('must belong to a booking', async () => {
    const { error } = await db.from('files').insert({
      studio_id: studioId, storage_path: 'x/1.jpg', name: '1.jpg',
    });
    expect(error, 'a file with no booking was accepted').not.toBeNull();
  });

  it('will not take the same path twice', async () => {
    const path = `${studioId}/${bookingId}/same.jpg`;
    const first = await db.from('files').insert({
      studio_id: studioId, booking_id: bookingId, storage_path: path, name: 'same.jpg',
    });
    const second = await db.from('files').insert({
      studio_id: studioId, booking_id: bookingId, storage_path: path, name: 'same.jpg',
    });

    expect(first.error).toBeNull();
    expect(second.error, 'two rows claimed one object in storage').not.toBeNull();
  });

  it('lets an edit know its original', async () => {
    const { data: raw } = await db.from('files').insert({
      studio_id: studioId, booking_id: bookingId,
      storage_path: `${studioId}/${bookingId}/raw.cr3`, name: 'raw.cr3',
    }).select('id').single();

    const { data: edit, error } = await db.from('files').insert({
      studio_id: studioId, booking_id: bookingId, derived_from: raw!.id,
      storage_path: `${studioId}/${bookingId}/edit.jpg`, name: 'edit.jpg',
    }).select('id, derived_from').single();

    expect(error).toBeNull();
    expect(edit!.derived_from, 'the edit lost its original').toBe(raw!.id);
  });

  it('records who chose a frame, once each', async () => {
    const { data: file } = await db.from('files').insert({
      studio_id: studioId, booking_id: bookingId,
      storage_path: `${studioId}/${bookingId}/pick.jpg`, name: 'pick.jpg',
    }).select('id').single();

    await db.from('choices').insert({
      studio_id: studioId, file_id: file!.id, person_id: personId,
    });
    const { error: again } = await db.from('choices').insert({
      studio_id: studioId, file_id: file!.id, person_id: personId,
    });

    expect(again, 'the same person chose the same frame twice').not.toBeNull();

    const { data: picks } = await db
      .from('choices').select('person_id').eq('file_id', file!.id);
    expect(picks!.length).toBe(1);
    expect(picks![0].person_id).toBe(personId);
  });

  it('goes with the booking when the booking goes', async () => {
    const { data: booking } = await db
      .from('bookings').insert({ studio_id: studioId }).select('id').single();
    const { data: file } = await db.from('files').insert({
      studio_id: studioId, booking_id: booking!.id,
      storage_path: `${studioId}/${booking!.id}/doomed.jpg`, name: 'doomed.jpg',
    }).select('id').single();

    await db.from('bookings').delete().eq('id', booking!.id);

    const { data: left } = await db
      .from('files').select('id').eq('id', file!.id).maybeSingle();
    expect(left, 'a file outlived the booking it belonged to').toBeNull();
  });
});

describe('how a set of files says itself', () => {
  const file = (over: Partial<StudioFile> = {}): StudioFile => ({
    id: 'a', name: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 2_500_000,
    derivedFrom: null, addedAt: '', url: null, chosenBy: [], ...over,
  });

  it('states what is there rather than counting', () => {
    expect(sayFiles([])).toBe('No files yet.');
    expect(sayFiles([file()])).toBe('1 file, none chosen yet.');
    expect(sayFiles([
      file(),
      file({ id: 'b', chosenBy: [{ personId: 'p', name: 'Ada' }] }),
    ])).toBe('2 files, 1 chosen.');
  });

  it('says sizes the way a person does', () => {
    expect(saySize(null)).toBe('Size unknown');
    expect(saySize(900)).toBe('900 B');
    expect(saySize(2_500_000)).toBe('2.4 MB');
    expect(isImage(file())).toBe(true);
    expect(isImage(file({ mimeType: 'application/pdf' }))).toBe(false);
  });
});
