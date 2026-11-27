'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { StudioFile } from './shape';

const BUCKET = 'weave-files';

/**
 * Files on a booking.
 *
 * Images are never served from a public URL. The bucket is private and every
 * image is read through a short-lived signed URL issued per request, so a path
 * cannot be guessed and a link cannot be forwarded forever.
 */
export async function filesForJob(bookingId: string): Promise<StudioFile[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db
    .from('files')
    .select('id, name, storage_path, mime_type, size_bytes, derived_from, created_at, '
      + 'choices:choices(person_id, person:people(name))')
    .eq('studio_id', who.studioId)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to read the files:', error);
    throw new Error('Could not read the files on this booking');
  }

  const rows = (data ?? []) as unknown as {
    id: string; name: string; storage_path: string; mime_type: string | null;
    size_bytes: number | null; derived_from: string | null;
    created_at: string;
    choices: { person_id: string; person: { name: string } | null }[];
  }[];

  if (rows.length === 0) return [];

  /*
   * One signing call for every path rather than one per file. Signing is a
   * round trip, and a gallery of four hundred images would otherwise be four
   * hundred of them before the page could draw.
   */
  const { data: signed } = await db.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), 60 * 60);

  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    derivedFrom: r.derived_from,
    addedAt: r.created_at,
    url: urlFor.get(r.storage_path) ?? null,
    chosenBy: (r.choices ?? []).map((c) => ({
      personId: c.person_id,
      name: c.person?.name ?? 'Somebody',
    })),
  }));
}

/**
 * A place to put one file, signed.
 *
 * The browser uploads STRAIGHT to storage with this token. Routing photographs
 * through the application server would mean a studio's upload speed was capped
 * by the app, and Next's own body limit is measured in megabytes while a raw
 * file is measured in tens of them.
 */
export async function placeToPut(input: {
  bookingId: string;
  name: string;
}): Promise<{ path: string; token: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  // Studio and booking in the path so a stray object is always attributable, and a
  // uuid so two cards with IMG_0001.jpg cannot overwrite one another.
  const safe = input.name.replace(/[^\w.\-]+/g, '_').slice(-120);
  const path = `${who.studioId}/${input.bookingId}/${randomUUID()}-${safe}`;

  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('Failed to make room for the file:', error);
    throw new Error('Could not make room for that file');
  }
  return { path: data.path, token: data.token };
}

/** Record a file that has landed in storage. */
export async function recordFile(input: {
  bookingId: string;
  storagePath: string;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  derivedFrom?: string | null;
}): Promise<{ id: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data, error } = await db
    .from('files')
    .insert({
      studio_id: who.studioId,
      booking_id: input.bookingId,
      derived_from: input.derivedFrom ?? null,
      storage_path: input.storagePath,
      name: input.name,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      added_by: who.personId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to record the file:', error);
    throw new Error('That file arrived but could not be recorded');
  }

  revalidatePath(`/bookings/${input.bookingId}`);
  return { id: data.id };
}

/**
 * Choose a file, or unchoose it.
 *
 * A studio marking selects and a client marking favourites are the same act
 * recorded against different people, which is why `person_id` is carried and
 * not a flag. Who chose a frame is the whole of the answer to "are these the
 * ones they want".
 */
export async function chooseFile(input: {
  fileId: string;
  bookingId: string;
  chosen: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  if (input.chosen) {
    const { error } = await db.from('choices').insert({
      studio_id: who.studioId,
      file_id: input.fileId,
      person_id: who.personId,
    });
    if (error && !String(error.message).includes('duplicate')) {
      console.error('Failed to choose the file:', error);
      throw new Error('Could not choose that');
    }
  } else {
    const { error } = await db
      .from('choices')
      .delete()
      .eq('studio_id', who.studioId)
      .eq('file_id', input.fileId)
      .eq('person_id', who.personId);
    if (error) {
      console.error('Failed to unchoose the file:', error);
      throw new Error('Could not unchoose that');
    }
  }

  revalidatePath(`/bookings/${input.bookingId}`);
}

/** Take a file off the booking, and out of storage with it. */
export async function removeFile(input: { fileId: string; bookingId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: file } = await db
    .from('files')
    .select('storage_path')
    .eq('id', input.fileId)
    .eq('studio_id', who.studioId)
    .maybeSingle();

  if (!file) return;

  const { error } = await db
    .from('files')
    .delete()
    .eq('id', input.fileId)
    .eq('studio_id', who.studioId);

  if (error) {
    console.error('Failed to remove the file:', error);
    throw new Error('Could not remove that file');
  }

  /*
   * The row goes first and the object second, deliberately. If storage fails
   * the studio is left with an unreferenced object costing pennies; if it were
   * the other way round they would be left with a file in the list that opens
   * to nothing, which is worse to meet.
   */
  const { error: gone } = await db.storage.from(BUCKET).remove([file.storage_path]);
  if (gone) console.error('File row removed but the object remains:', file.storage_path, gone);

  revalidatePath(`/bookings/${input.bookingId}`);
}
