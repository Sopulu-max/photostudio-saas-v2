'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { RoomScene } from './shape';

/**
 * The rooms a studio hangs its prints in.
 *
 * Photographs the studio supplies, because a drawn room is a diagram of a
 * room and sells nothing. A photographer owns a camera and shoots in better
 * spaces than a stock library, so these are theirs — which also makes the
 * store theirs rather than a platform's, which is the whole point.
 *
 * Signed upload straight to storage from the browser, the same way gallery
 * files go up: a room photograph is several megabytes and a server action
 * body is capped at one.
 */

const BUCKET = 'weave-files';

/** An hour is long enough to look at a store and short enough not to leak. */
const LOOK_FOR = 60 * 60;

async function withUrls(rows: {
  id: string; name: string; storage_path: string;
  wall_mm: number | null; hang_x: string | number | null; hang_y: string | number | null;
  position: number;
}[]): Promise<RoomScene[]> {
  if (rows.length === 0) return [];
  const { data: signed } = await db.storage
    .from(BUCKET).createSignedUrls(rows.map((r) => r.storage_path), LOOK_FOR);
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    url: urlFor.get(row.storage_path) ?? null,
    position: row.position,
    /*
     * numeric comes back from PostgREST as a string, because a double cannot
     * hold every numeric exactly. Three of these have been lost to Number()
     * being assumed elsewhere; it is done once, here.
     */
    hangs: row.wall_mm !== null && row.hang_x !== null && row.hang_y !== null
      ? { wallMm: row.wall_mm, x: Number(row.hang_x), y: Number(row.hang_y) }
      : null,
  }));
}

/** Every scene this studio has, in the order it arranged them. */
export async function roomScenes(): Promise<RoomScene[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  const { data, error } = await db.from('room_scenes')
    .select('id, name, storage_path, wall_mm, hang_x, hang_y, position')
    .eq('studio_id', who.studioId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Failed to read the room scenes:', error);
    return [];
  }
  return withUrls(data ?? []);
}

/**
 * The scenes a client sees in a gallery's store.
 *
 * By gallery token rather than by sign-in, because the person looking at them
 * has no account. The gallery proves which studio is being shopped from, so
 * nothing here takes a studio id from the caller.
 */
export async function scenesForGallery(token: string): Promise<RoomScene[]> {
  const { data: gallery } = await db.from('galleries')
    .select('studio_id, shared_at').eq('token', token).maybeSingle();
  if (!gallery?.shared_at) return [];

  const { data } = await db.from('room_scenes')
    .select('id, name, storage_path, wall_mm, hang_x, hang_y, position')
    .eq('studio_id', gallery.studio_id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  return withUrls(data ?? []);
}

export async function placeToPutScene(input: { name: string }): Promise<{ path: string; token: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const safe = input.name.replace(/[^\w.\-]+/g, '_').slice(-120);
  const path = `${who.studioId}/room-scenes/${randomUUID()}-${safe}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error('Could not make room for that photograph');
  return { path: data.path, token: data.token };
}

export async function recordScene(input: { storagePath: string; name: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  if (!input.storagePath.startsWith(`${who.studioId}/room-scenes/`)) {
    throw new Error('That photograph does not belong here');
  }
  const name = input.name.trim();
  if (!name) throw new Error('Name the scene');

  const { count } = await db.from('room_scenes')
    .select('id', { count: 'exact', head: true }).eq('studio_id', who.studioId);

  const { error } = await db.from('room_scenes').insert({
    studio_id: who.studioId, name, storage_path: input.storagePath, position: count ?? 0,
  });
  if (error) throw new Error('Could not save that scene');

  revalidatePath('/store');
}

/**
 * Where a print hangs in this photograph, and how wide the photograph is.
 *
 * Passing nothing makes it a detail shot — the edge of a frame, a float mount
 * — shown as it is with no picture composited. That is half of what sells an
 * object, and it needs no geometry at all.
 */
export async function setScenePlacement(input: {
  sceneId: string;
  wallMm: number | null;
  x: number | null;
  y: number | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const given = [input.wallMm, input.x, input.y].filter((v) => v !== null).length;
  if (given !== 0 && given !== 3) {
    throw new Error('A scene needs the wall width and both positions, or none of them');
  }
  if (input.wallMm !== null && (input.wallMm < 300 || input.wallMm > 20_000)) {
    throw new Error('That is not the width of a wall');
  }
  if (input.x !== null && (input.x < 0 || input.x > 1 || input.y! < 0 || input.y! > 1)) {
    throw new Error('That spot is outside the photograph');
  }

  const { error } = await db.from('room_scenes')
    .update({ wall_mm: input.wallMm, hang_x: input.x, hang_y: input.y })
    .eq('id', input.sceneId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not place that scene');

  revalidatePath('/store');
}

export async function removeScene(input: { sceneId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: scene } = await db.from('room_scenes')
    .select('storage_path').eq('id', input.sceneId).eq('studio_id', who.studioId).maybeSingle();
  if (!scene) throw new Error('That scene is not in this studio');

  await db.storage.from(BUCKET).remove([scene.storage_path]);
  await db.from('room_scenes').delete().eq('id', input.sceneId).eq('studio_id', who.studioId);

  revalidatePath('/store');
}
