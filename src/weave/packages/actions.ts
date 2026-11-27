'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { Package } from './shape';

/* One literal, deliberately: split with `+` and the typed client stops being
 * able to parse it, falling back to GenericStringError for every row. */
const SELECT = 'id, name, about, price, currency, pictures_promised, gallery_template_id, published_at, position';

type Row = {
  id: string; name: string; about: string | null; price: number | null;
  currency: string; pictures_promised: number | null;
  gallery_template_id: string | null;
  published_at: string | null; position: number;
};

function shape(r: Row): Package {
  return {
    id: r.id,
    name: r.name,
    about: r.about,
    price: r.price,
    currency: r.currency,
    picturesPromised: r.pictures_promised,
    galleryTemplateId: r.gallery_template_id,
    publishedAt: r.published_at,
    position: r.position,
  };
}

export async function packages(): Promise<Package[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  const { data, error } = await db.from('packages').select(SELECT)
    .eq('studio_id', who.studioId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Failed to read the packages:', error);
    return [];
  }
  return ((data ?? []) as Row[]).map(shape);
}

/**
 * What somebody at a studio's public address may choose from.
 *
 * Published only. A package being worked on is not an offer, and a client
 * should never be able to book something the studio has not finished saying.
 */
export async function packagesOffered(slug: string): Promise<Package[]> {
  const { data: studio } = await db.from('studios').select('id').eq('slug', slug).maybeSingle();
  if (!studio) return [];
  const { data } = await db.from('packages').select(SELECT)
    .eq('studio_id', studio.id)
    .not('published_at', 'is', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  return ((data ?? []) as Row[]).map(shape);
}

export async function addPackage(input: {
  name: string;
  about?: string;
  price?: number | null;
  picturesPromised?: number | null;
}): Promise<{ id: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const name = input.name.trim();
  if (!name) throw new Error('A package needs a name');

  const promised = input.picturesPromised ?? null;
  if (promised !== null && (!Number.isInteger(promised) || promised < 1 || promised > 100_000)) {
    throw new Error('That is not a number of pictures');
  }
  const price = input.price ?? null;
  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    throw new Error('That price is not a price');
  }

  const { count } = await db.from('packages')
    .select('id', { count: 'exact', head: true }).eq('studio_id', who.studioId);

  const { data, error } = await db.from('packages').insert({
    studio_id: who.studioId,
    name,
    about: input.about?.trim() || null,
    price,
    pictures_promised: promised,
    position: count ?? 0,
  }).select('id').single();

  if (error || !data) {
    console.error('Could not add that package:', error);
    throw new Error('Could not add that package');
  }

  revalidatePath('/packages');
  return { id: data.id };
}

export async function amendPackage(input: {
  packageId: string;
  name?: string;
  about?: string | null;
  price?: number | null;
  picturesPromised?: number | null;
  galleryTemplateId?: string | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('A package needs a name');
    patch.name = name;
  }
  if (input.about !== undefined) patch.about = input.about?.trim() || null;
  if (input.price !== undefined) patch.price = input.price;
  if (input.picturesPromised !== undefined) patch.pictures_promised = input.picturesPromised;
  /*
   * Checked against this studio's own templates before it is written. The id
   * arrives from a form, and the database would accept another studio's
   * template id perfectly happily — the foreign key does not know about
   * tenancy.
   */
  if (input.galleryTemplateId !== undefined) {
    if (input.galleryTemplateId) {
      const { data: ours } = await db.from('gallery_templates')
        .select('id').eq('id', input.galleryTemplateId)
        .eq('studio_id', who.studioId).maybeSingle();
      if (!ours) throw new Error('That gallery template is not in this studio');
    }
    patch.gallery_template_id = input.galleryTemplateId;
  }

  if (Object.keys(patch).length === 0) return;

  const { error } = await db.from('packages').update(patch)
    .eq('id', input.packageId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not change that package');

  revalidatePath('/packages');
}

/**
 * Offer it, or stop offering it.
 *
 * Changing a package never reaches backwards into bookings that already took
 * it: what was promised was copied onto the gallery when the booking was
 * accepted, and that is history.
 */
export async function setPackageOffered(input: {
  packageId: string; offered: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db.from('packages')
    .update({ published_at: input.offered ? new Date().toISOString() : null })
    .eq('id', input.packageId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not do that');

  revalidatePath('/packages');
}

export async function removePackage(input: { packageId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  /*
   * Bookings that took it keep their own copy of the promise, so deleting the
   * package cannot change what anybody was told. The reference falls to null
   * and the gallery keeps its number.
   */
  const { error } = await db.from('packages').delete()
    .eq('id', input.packageId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not remove that package');

  revalidatePath('/packages');
}
