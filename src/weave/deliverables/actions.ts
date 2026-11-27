'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { Deliverable, DeliverableKind, ShownAs } from './shape';

const SELECT = 'id, name, kind, width_mm, height_mm, shown_as, fills_gallery, position';

type Row = {
  id: string; name: string; kind: DeliverableKind;
  width_mm: number | null; height_mm: number | null;
  shown_as: ShownAs | null; fills_gallery: boolean; position: number;
};

function shape(r: Row): Deliverable {
  return {
    id: r.id, name: r.name, kind: r.kind,
    widthMm: r.width_mm, heightMm: r.height_mm,
    shownAs: r.shown_as, fillsGallery: r.fills_gallery, position: r.position,
  };
}

/** Everything this studio delivers, in the order it arranged them. */
export async function deliverables(): Promise<Deliverable[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db.from('deliverables').select(SELECT)
    .eq('studio_id', who.studioId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Could not read the deliverables:', error);
    return [];
  }
  return ((data ?? []) as Row[]).map(shape);
}

/**
 * Add one.
 *
 * A name is all that is required. A studio should be able to write down
 * "Retouched image" and get on with its day — the size and how it hangs can
 * be filled in later, or never, because plenty of things a studio delivers
 * are not hung on a wall.
 */
export async function addDeliverable(input: {
  name: string;
  kind: DeliverableKind;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const name = input.name.trim();
  if (!name) throw new Error('Give it a name');

  const { count } = await db.from('deliverables')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', who.studioId);

  const { error } = await db.from('deliverables').insert({
    studio_id: who.studioId,
    name,
    kind: input.kind,
    position: count ?? 0,
  });

  if (error) {
    console.error('Could not add that deliverable:', error);
    throw new Error('Could not add that');
  }
  revalidatePath('/deliverables');
}

export async function amendDeliverable(input: {
  deliverableId: string;
  name?: string;
  kind?: DeliverableKind;
  widthMm?: number | null;
  heightMm?: number | null;
  shownAs?: ShownAs | null;
  fillsGallery?: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Give it a name');
    patch.name = name;
  }
  if (input.widthMm !== undefined) patch.width_mm = input.widthMm;
  if (input.heightMm !== undefined) patch.height_mm = input.heightMm;
  if (input.shownAs !== undefined) patch.shown_as = input.shownAs;
  if (input.fillsGallery !== undefined) patch.fills_gallery = input.fillsGallery;

  /*
   * Turning something digital clears what only a physical thing can have.
   * The database refuses the row otherwise, and "a file cannot be 8 inches
   * wide" is a better answer than a constraint violation.
   */
  if (input.kind !== undefined) {
    patch.kind = input.kind;
    if (input.kind === 'digital') {
      patch.width_mm = null;
      patch.height_mm = null;
      patch.shown_as = null;
    }
  }

  if (Object.keys(patch).length === 0) return;

  const { error } = await db.from('deliverables').update(patch)
    .eq('id', input.deliverableId).eq('studio_id', who.studioId);

  if (error) {
    console.error('Could not change that deliverable:', error);
    throw new Error('Could not change that');
  }
  revalidatePath('/deliverables');
}

/**
 * Remove one.
 *
 * A deliverable that a price list sells is held by a restricting foreign key,
 * so this fails rather than quietly emptying somebody's shop. Said plainly,
 * because "could not delete" with no reason is the kind of message that makes
 * a studio try again harder.
 */
export async function removeDeliverable(input: { deliverableId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db.from('deliverables').delete()
    .eq('id', input.deliverableId).eq('studio_id', who.studioId);

  if (error) {
    if (error.code === '23503') {
      throw new Error('This is being sold in a price list. Remove it there first.');
    }
    console.error('Could not remove that deliverable:', error);
    throw new Error('Could not remove that');
  }
  revalidatePath('/deliverables');
}
