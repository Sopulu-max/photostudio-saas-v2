import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { sayGallery, type GallerySummary } from '@/weave/galleries/shape';

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
let jobId: string;
let fileId: string;

beforeAll(async () => {
  const { data: studio, error } = await db
    .from('studios').insert({ name: `Test Studio ${Date.now()}` }).select('id').single();
  if (error) throw error;
  studioId = studio.id;

  const { data: job } = await db
    .from('jobs').insert({ studio_id: studioId }).select('id').single();
  jobId = job!.id;

  const { data: file } = await db.from('files').insert({
    studio_id: studioId, job_id: jobId,
    storage_path: `${studioId}/${jobId}/g.jpg`, name: 'g.jpg', mime_type: 'image/jpeg',
  }).select('id').single();
  fileId = file!.id;
});

afterAll(async () => {
  if (studioId) await db.from('studios').delete().eq('id', studioId);
});

/**
 * Every member of a gallery belongs to a section — a gallery is a composed
 * sequence, not one undifferentiated wall. These tests predate sections, so
 * they make the one a new gallery would otherwise be given.
 */
async function sectionIn(galleryId: string): Promise<string> {
  const { data } = await db
    .from('gallery_sections')
    .insert({ studio_id: studioId, gallery_id: galleryId, name: 'Gallery', position: 0 })
    .select('id').single();
  return data!.id;
}

describe('galleries', () => {
  it('gets an unguessable link without being asked', async () => {
    const { data, error } = await db
      .from('galleries')
      .insert({ studio_id: studioId, job_id: jobId, name: 'Selects' })
      .select('token, shared_at')
      .single();

    expect(error).toBeNull();
    expect(data!.token, 'a gallery was made with no link').toBeTruthy();
    expect(data!.token.length, 'the link is short enough to guess').toBeGreaterThanOrEqual(32);
    expect(data!.shared_at, 'a new gallery was open before anybody sent it').toBeNull();
  });

  it('will not hold the same picture twice', async () => {
    const { data: gallery } = await db
      .from('galleries')
      .insert({ studio_id: studioId, job_id: jobId, name: 'Twice' })
      .select('id').single();

    const sectionId = await sectionIn(gallery!.id);

    const first = await db.from('gallery_files').insert({
      studio_id: studioId, gallery_id: gallery!.id, section_id: sectionId,
      file_id: fileId, position: 0,
    });
    const second = await db.from('gallery_files').insert({
      studio_id: studioId, gallery_id: gallery!.id, section_id: sectionId,
      file_id: fileId, position: 1,
    });

    expect(first.error).toBeNull();
    expect(second.error, 'one picture went into a gallery twice').not.toBeNull();
  });

  it('empties itself when a picture is removed from the job', async () => {
    const { data: gallery } = await db
      .from('galleries')
      .insert({ studio_id: studioId, job_id: jobId, name: 'Fleeting' })
      .select('id').single();
    const { data: file } = await db.from('files').insert({
      studio_id: studioId, job_id: jobId,
      storage_path: `${studioId}/${jobId}/fleeting.jpg`, name: 'fleeting.jpg',
    }).select('id').single();
    await db.from('gallery_files').insert({
      studio_id: studioId, gallery_id: gallery!.id,
      section_id: await sectionIn(gallery!.id), file_id: file!.id,
    });

    await db.from('files').delete().eq('id', file!.id);

    const { data: left } = await db
      .from('gallery_files').select('id').eq('gallery_id', gallery!.id);
    expect(left!.length, 'a gallery still pointed at a deleted picture').toBe(0);
  });

  it('goes with the job when the job goes', async () => {
    const { data: job } = await db
      .from('jobs').insert({ studio_id: studioId }).select('id').single();
    const { data: gallery } = await db
      .from('galleries')
      .insert({ studio_id: studioId, job_id: job!.id, name: 'Doomed' })
      .select('id').single();

    await db.from('jobs').delete().eq('id', job!.id);

    const { data: left } = await db
      .from('galleries').select('id').eq('id', gallery!.id).maybeSingle();
    expect(left, 'a gallery outlived the job it came from').toBeNull();
  });
});

describe('how a gallery says itself', () => {
  const g = (over: Partial<GallerySummary> = {}): GallerySummary => ({
    id: 'a', name: 'Selects', token: 't', sharedAt: null, expiresOn: null,
    accessMode: 'link', mayDownload: true, howMany: 12, coverFileId: null,
    sections: [], members: [], collections: [], priceListId: null, ...over,
  });

  it('distinguishes empty from unsent', () => {
    expect(sayGallery(g({ howMany: 0 }))).toBe('Empty, nothing to send yet');
    expect(sayGallery(g())).toBe('12 pictures, not sent yet');
    expect(sayGallery(g({ sharedAt: '2026-11-18T00:00:00Z' }))).toBe('12 pictures, open to the client');
    expect(sayGallery(g({ sharedAt: '2026-11-18T00:00:00Z', expiresOn: '2026-12-01' })))
      .toBe('12 pictures, open until 2026-12-01');
    expect(sayGallery(g({ howMany: 1 }))).toBe('1 picture, not sent yet');
  });
});
