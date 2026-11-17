'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { GallerySummary, PublicGallery } from './shape';

const BUCKET = 'weave-files';

/** The galleries made from one job. */
export async function galleriesForJob(jobId: string): Promise<GallerySummary[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db
    .from('galleries')
    .select('id, name, token, shared_at, may_download, price_list_id, gallery_files(id)')
    .eq('studio_id', who.studioId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to read the galleries:', error);
    throw new Error('Could not read the galleries on this job');
  }

  return ((data ?? []) as unknown as {
    id: string; name: string; token: string; shared_at: string | null;
    may_download: boolean; price_list_id: string | null; gallery_files: { id: string }[];
  }[]).map((g) => ({
    id: g.id,
    name: g.name,
    token: g.token,
    sharedAt: g.shared_at,
    mayDownload: g.may_download,
    howMany: (g.gallery_files ?? []).length,
    priceListId: g.price_list_id,
  }));
}

/**
 * Make a gallery from the files already chosen on this job.
 *
 * Seeded from the studio's own choices because that is what choosing is for —
 * but copied in, not derived, so unchoosing a frame later cannot reach into a
 * gallery somebody is already looking at.
 */
export async function makeGallery(input: {
  jobId: string;
  name: string;
  fromChosen?: boolean;
}): Promise<{ id: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const name = input.name.trim();
  if (!name) throw new Error('A gallery needs a name');

  const { data: gallery, error } = await db
    .from('galleries')
    .insert({ studio_id: who.studioId, job_id: input.jobId, name })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to make the gallery:', error);
    throw new Error('Could not make that gallery');
  }

  if (input.fromChosen !== false) {
    const { data: files } = await db
      .from('files')
      .select('id, created_at, choices:choices(id)')
      .eq('studio_id', who.studioId)
      .eq('job_id', input.jobId)
      .order('created_at', { ascending: true });

    const chosen = ((files ?? []) as unknown as { id: string; choices: { id: string }[] }[])
      .filter((f) => (f.choices ?? []).length > 0);

    if (chosen.length > 0) {
      await db.from('gallery_files').insert(
        chosen.map((f, i) => ({
          studio_id: who.studioId,
          gallery_id: gallery.id,
          file_id: f.id,
          position: i,
        })),
      );
    }
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'gallery',
    subject_id: gallery.id,
    action: 'made',
    actor_id: who.personId,
    payload: { name, job: input.jobId },
  });

  revalidatePath(`/jobs/${input.jobId}`);
  return { id: gallery.id };
}

/** Put every file on the job into the gallery, skipping what is already in. */
export async function fillGallery(input: {
  galleryId: string;
  jobId: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const [{ data: files }, { data: already }] = await Promise.all([
    db.from('files').select('id').eq('studio_id', who.studioId)
      .eq('job_id', input.jobId).order('created_at', { ascending: true }),
    db.from('gallery_files').select('file_id').eq('gallery_id', input.galleryId),
  ]);

  const have = new Set((already ?? []).map((r) => r.file_id));
  const missing = (files ?? []).filter((f) => !have.has(f.id));
  if (missing.length === 0) return;

  const { error } = await db.from('gallery_files').insert(
    missing.map((f, i) => ({
      studio_id: who.studioId,
      gallery_id: input.galleryId,
      file_id: f.id,
      position: have.size + i,
    })),
  );

  if (error) {
    console.error('Failed to fill the gallery:', error);
    throw new Error('Could not add those');
  }
  revalidatePath(`/jobs/${input.jobId}`);
}

/**
 * Share it, or stop sharing it.
 *
 * Stopping does not change the link — it closes the door. Rotating the token
 * instead would silently break a link the client may have been sent, and they
 * would meet a dead address with no explanation.
 */
export async function shareGallery(input: {
  galleryId: string;
  jobId: string;
  shared: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db
    .from('galleries')
    .update({ shared_at: input.shared ? new Date().toISOString() : null })
    .eq('id', input.galleryId)
    .eq('studio_id', who.studioId);

  if (error) {
    console.error('Failed to share the gallery:', error);
    throw new Error('Could not change that');
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'gallery',
    subject_id: input.galleryId,
    action: input.shared ? 'shared' : 'closed',
    actor_id: who.personId,
    payload: {},
  });

  revalidatePath(`/jobs/${input.jobId}`);
}

export async function allowDownload(input: {
  galleryId: string; jobId: string; may: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db
    .from('galleries')
    .update({ may_download: input.may })
    .eq('id', input.galleryId)
    .eq('studio_id', who.studioId);

  if (error) throw new Error('Could not change that');
  revalidatePath(`/jobs/${input.jobId}`);
}

/**
 * The gallery as the client meets it — by token, with no session.
 *
 * Returns nothing at all for a gallery that has not been shared. A gallery
 * being built and a gallery being live are different things, and the token
 * existing is not permission.
 */
export async function openGallery(token: string): Promise<PublicGallery | null> {
  const { data, error } = await db
    .from('galleries')
    .select('id, name, token, shared_at, may_download, studio:studios(name), '
      + 'items:gallery_files(position, file:files(id, name, storage_path, mime_type))')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('Failed to open the gallery:', error);
    return null;
  }
  if (!data) return null;

  const g = data as unknown as {
    id: string; name: string; token: string; shared_at: string | null;
    may_download: boolean; studio: { name: string } | null;
    items: { position: number; file: { id: string; name: string; storage_path: string; mime_type: string | null } | null }[];
  };

  if (!g.shared_at) return null;

  const items = (g.items ?? [])
    .filter((i) => i.file)
    .sort((a, b) => a.position - b.position);

  const { data: signed } = await db.storage
    .from(BUCKET)
    .createSignedUrls(items.map((i) => i.file!.storage_path), 60 * 60);
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return {
    id: g.id,
    name: g.name,
    token: g.token,
    studioName: g.studio?.name ?? 'The studio',
    mayDownload: g.may_download,
    files: items.map((i) => ({
      id: i.file!.id,
      name: i.file!.name,
      mimeType: i.file!.mime_type,
      url: urlFor.get(i.file!.storage_path) ?? null,
    })),
  };
}

/**
 * A visitor favouriting a frame.
 *
 * They identify by email, which finds or makes a person in the studio's own
 * books. That is the point: the client's favourites land in the SAME table as
 * the studio's selects, attributed to a real person, so "are these the ones
 * they want" has an answer rather than a guess.
 */
export async function favourite(input: {
  token: string;
  fileId: string;
  email: string;
  name?: string;
  on: boolean;
}): Promise<void> {
  const { data: gallery } = await db
    .from('galleries')
    .select('id, studio_id, shared_at')
    .eq('token', input.token)
    .maybeSingle();

  if (!gallery || !gallery.shared_at) throw new Error('That gallery is not open');

  // The file has to be IN this gallery. Without this check a visitor holding
  // one token could favourite any file in the studio by id.
  const { data: inIt } = await db
    .from('gallery_files')
    .select('id')
    .eq('gallery_id', gallery.id)
    .eq('file_id', input.fileId)
    .maybeSingle();
  if (!inIt) throw new Error('That picture is not in this gallery');

  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error('An email is needed to keep your picks');

  const { data: found } = await db
    .from('people')
    .select('id')
    .eq('studio_id', gallery.studio_id)
    .eq('email', email)
    .maybeSingle();

  let personId = found?.id ?? null;
  if (!personId) {
    const { data: made, error } = await db
      .from('people')
      .insert({
        studio_id: gallery.studio_id,
        name: input.name?.trim() || email,
        email,
      })
      .select('id')
      .single();
    if (error) throw new Error('Could not keep your picks');
    personId = made.id;
  }

  if (input.on) {
    const { error } = await db.from('choices').insert({
      studio_id: gallery.studio_id, file_id: input.fileId, person_id: personId,
    });
    if (error && !String(error.message).includes('duplicate')) {
      throw new Error('Could not keep that pick');
    }
  } else {
    await db.from('choices').delete()
      .eq('file_id', input.fileId).eq('person_id', personId);
  }

  revalidatePath(`/g/${input.token}`);
}

/** What this visitor has already picked, so the gallery opens where they left it. */
export async function picksOf(input: {
  token: string; email: string;
}): Promise<string[]> {
  const { data: gallery } = await db
    .from('galleries').select('id, studio_id, shared_at')
    .eq('token', input.token).maybeSingle();
  if (!gallery?.shared_at) return [];

  const { data: person } = await db
    .from('people').select('id')
    .eq('studio_id', gallery.studio_id)
    .eq('email', input.email.trim().toLowerCase())
    .maybeSingle();
  if (!person) return [];

  const { data } = await db
    .from('gallery_files')
    .select('file_id, choices:files(choices(person_id))')
    .eq('gallery_id', gallery.id);

  const ids = ((data ?? []) as unknown as {
    file_id: string; choices: { choices: { person_id: string }[] } | null;
  }[])
    .filter((r) => (r.choices?.choices ?? []).some((c) => c.person_id === person.id))
    .map((r) => r.file_id);

  return ids;
}
