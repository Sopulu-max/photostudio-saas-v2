'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';

/**
 * What a package looks like.
 *
 * An ordered list of pictures and video. The first is the cover; there is no
 * `is_cover` column, because a second claim about the same thing goes out of
 * step with the ordering the moment somebody reorders.
 *
 * Uploads go browser-to-storage through a signed URL, the same way a job's
 * files do: a server action's body is measured in megabytes and a video is
 * measured in tens of them.
 */

const BUCKET = 'weave-files';

export type PackageMedia = {
  id: string;
  packageId: string;
  kind: 'image' | 'video';
  url: string;
  caption: string | null;
  position: number;
};

/** What the engine will actually do with the file decides what it is. */
function kindOf(mimeType: string | null): 'image' | 'video' | null {
  if (!mimeType) return null;
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

export async function placeToPutPackageMedia(input: {
  packageId: string;
  name: string;
}): Promise<{ path: string; token: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: ours } = await db.from('packages')
    .select('id').eq('id', input.packageId).eq('studio_id', who.studioId).maybeSingle();
  if (!ours) throw new Error('That package is not in this studio');

  const safe = input.name.replace(/[^\w.\-]+/g, '_').slice(-120);
  const path = `${who.studioId}/packages/${input.packageId}/${randomUUID()}-${safe}`;

  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('Failed to make room for the package media:', error);
    throw new Error('Could not make room for that file');
  }
  return { path: data.path, token: data.token };
}

/** Record what has landed, at the end of the order. */
export async function recordPackageMedia(input: {
  packageId: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const kind = kindOf(input.mimeType);
  if (!kind) throw new Error('A package shows pictures and video, nothing else');

  const { count } = await db.from('package_media')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', who.studioId).eq('package_id', input.packageId);

  const { error } = await db.from('package_media').insert({
    studio_id: who.studioId,
    package_id: input.packageId,
    storage_path: input.storagePath,
    kind,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    position: count ?? 0,
  });

  if (error) {
    console.error('Could not record the package media:', error);
    throw new Error('Could not add that to the package');
  }
  revalidatePath('/packages');
}

export async function removePackageMedia(input: { mediaId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: row } = await db.from('package_media')
    .select('storage_path').eq('id', input.mediaId)
    .eq('studio_id', who.studioId).maybeSingle();

  const { error } = await db.from('package_media').delete()
    .eq('id', input.mediaId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not remove that');

  /*
   * The object goes too. A row deleted without its file leaves storage
   * growing with things nothing can ever reach again, and nobody finds that
   * out until a bill arrives.
   */
  if (row?.storage_path) {
    const { error: gone } = await db.storage.from(BUCKET).remove([row.storage_path]);
    if (gone) console.error('Removed the row but not the object:', row.storage_path, gone);
  }

  revalidatePath('/packages');
}

/**
 * Move one earlier or later, swapping with its neighbour.
 *
 * Moving the second one to the front is how a studio changes the cover,
 * because the front IS the cover.
 */
export async function movePackageMedia(input: {
  mediaId: string;
  towards: 'front' | 'back';
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: me } = await db.from('package_media')
    .select('id, package_id, position').eq('id', input.mediaId)
    .eq('studio_id', who.studioId).maybeSingle();
  if (!me) throw new Error('That is not in this studio');

  const { data: siblings } = await db.from('package_media')
    .select('id, position').eq('package_id', me.package_id)
    .eq('studio_id', who.studioId)
    .order('position', { ascending: true }).order('created_at', { ascending: true });

  const order = (siblings ?? []) as { id: string; position: number }[];
  const at = order.findIndex((m) => m.id === me.id);
  const to = input.towards === 'front' ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= order.length) return;

  [order[at], order[to]] = [order[to], order[at]];

  /*
   * Rewritten as 0..n rather than swapping two numbers. Positions drift —
   * rows arrive with the same one, a delete leaves a hole — and renumbering
   * what is already in hand costs nothing and ends the drift.
   */
  await Promise.all(order.map((m, i) => db.from('package_media')
    .update({ position: i }).eq('id', m.id).eq('studio_id', who.studioId)));

  revalidatePath('/packages');
}

type Row = {
  id: string; package_id: string; kind: 'image' | 'video';
  storage_path: string; caption: string | null; position: number;
};

/**
 * Signed for an hour at a time.
 *
 * Shared by the studio's own page and the public storefront, so it takes the
 * studio rather than asking who is looking — nobody is signed in on a
 * storefront, and a client must still see the pictures.
 */
async function readMedia(studioId: string, packageIds: string[]): Promise<PackageMedia[]> {
  if (packageIds.length === 0) return [];

  const { data, error } = await db.from('package_media')
    .select('id, package_id, kind, storage_path, caption, position')
    .eq('studio_id', studioId).in('package_id', packageIds)
    .order('position', { ascending: true }).order('created_at', { ascending: true });

  if (error || !data) {
    console.error('Could not read the package media:', error);
    return [];
  }

  const rows = data as Row[];
  if (rows.length === 0) return [];

  const { data: signed } = await db.storage.from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), 60 * 60);

  return rows.map((r, i) => ({
    id: r.id,
    packageId: r.package_id,
    kind: r.kind,
    url: signed?.[i]?.signedUrl ?? '',
    caption: r.caption,
    position: r.position,
  })).filter((m) => m.url !== '');
}

/** For the studio's own packages page. */
export async function mediaForPackages(packageIds: string[]): Promise<PackageMedia[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  return readMedia(who.studioId, packageIds);
}

/** For the public page, where nobody is signed in. */
export async function mediaOnOffer(
  studioId: string, packageIds: string[],
): Promise<PackageMedia[]> {
  return readMedia(studioId, packageIds);
}
