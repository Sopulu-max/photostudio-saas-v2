'use server';

import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';

/**
 * The shop, as a studio needs to see it.
 *
 * The page that edits a shop was a form over two tables, and a studio could
 * fill both of them in completely while selling nothing — because what makes
 * a thing buyable is a GALLERY pointing at a price list, and that fact lived
 * on a different screen entirely. A page about selling that cannot tell you
 * whether you are selling is not finished.
 *
 * It also carries a real picture out of a real gallery, so the shop can be
 * shown rather than described. A studio should see what their client sees.
 */

const BUCKET = 'weave-files';

export type Shopfront = {
  galleries: number;
  selling: number;
  /** Pictures a client could actually buy from, across every selling gallery. */
  buyable: number;
  /** One of their own, to stand in the room. Null before anything is uploaded. */
  samplePictureUrl: string | null;
  sampleGalleryName: string | null;
};

export async function theShopfront(): Promise<Shopfront> {
  const who = await whoIsAsking();
  const empty: Shopfront = {
    galleries: 0, selling: 0, buyable: 0, samplePictureUrl: null, sampleGalleryName: null,
  };
  if (!who) return empty;

  const { data, error } = await db.from('galleries')
    .select('id, name, price_list_id, gallery_files(file:files(storage_path, mime_type))')
    .eq('studio_id', who.studioId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to read the shopfront:', error);
    return empty;
  }

  const rows = (data ?? []) as unknown as {
    id: string; name: string; price_list_id: string | null;
    gallery_files: { file: { storage_path: string; mime_type: string | null } | null }[];
  }[];

  const selling = rows.filter((g) => g.price_list_id);
  const buyable = selling.reduce((n, g) => n + (g.gallery_files ?? []).length, 0);

  /*
   * The first picture out of the newest selling gallery. A real one, because
   * a placeholder in a preview of a shop teaches a studio nothing about what
   * their shop looks like.
   */
  const from = selling.find((g) => (g.gallery_files ?? []).some(
    (f) => (f.file?.mime_type ?? '').startsWith('image/'),
  ));
  const picture = from?.gallery_files.find(
    (f) => (f.file?.mime_type ?? '').startsWith('image/'),
  )?.file ?? null;

  let samplePictureUrl: string | null = null;
  if (picture) {
    const { data: signed } = await db.storage
      .from(BUCKET).createSignedUrl(picture.storage_path, 60 * 60);
    samplePictureUrl = signed?.signedUrl ?? null;
  }

  return {
    galleries: rows.length,
    selling: selling.length,
    buyable,
    samplePictureUrl,
    sampleGalleryName: from?.name ?? null,
  };
}

/**
 * Said as a state of affairs, not a count of rows.
 *
 * "1 price list" told a studio about a table. What they need to know is
 * whether anybody can buy anything, and what is stopping them if not.
 */
export async function sayShopfront(front: Shopfront, rooms: number, things: number): Promise<string> {
  if (things === 0) return 'No products priced.';
  if (front.galleries === 0) return 'Products priced. No galleries to sell from yet.';
  if (front.selling === 0) return 'No gallery is linked to a price list.';
  // One phrase, pluralised once. Two copies of it is how "1 of 1 galleries"
  // gets shipped.
  const where = `${front.selling} of ${front.galleries} `
    + `${front.galleries === 1 ? 'gallery selling' : 'galleries selling'}`;

  if (rooms === 0) return `${where}. No room photograph, so clients see prices without a preview.`;

  return `${where}. ${front.buyable} ${front.buyable === 1 ? 'image' : 'images'} available to buy.`;
}
