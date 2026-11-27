'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import {
  freshElement, MODES,
  type AnswerKind, type ElementMode, type ElementType, type PackageElement,
} from './elements';

/**
 * Both pages that show a package.
 *
 * `revalidatePath('/packages')` alone refreshes the LIST and not the designer
 * the editing happens on — a literal path matches only itself. The row landed
 * in the table and the studio watched nothing happen, which is the same bug
 * that made choosing a package look like a no-op. A dynamic segment needs the
 * route pattern and the 'page' type, and the route group is not in the URL.
 */
function refreshBoth(): void {
  revalidatePath('/packages');
  revalidatePath('/packages/[id]', 'page');
}

/**
 * Editing the document a package is made of.
 *
 * Every write is scoped to the asking studio, and a package id arriving from
 * a form is checked against it before anything is written — the foreign key
 * knows nothing about tenancy.
 */

const SELECT = 'id, package_id, type, mode, deliverable_id, count, body, detail, answer_kind, media_id, position';

type Row = {
  id: string; package_id: string; type: ElementType; mode: ElementMode;
  deliverable_id: string | null; count: number | null;
  body: string | null; detail: string | null;
  answer_kind: AnswerKind | null;
  media_id: string | null; position: number;
};

function shape(r: Row): PackageElement {
  return {
    id: r.id, packageId: r.package_id, type: r.type, mode: r.mode,
    deliverableId: r.deliverable_id, count: r.count, body: r.body, detail: r.detail,
    answerKind: r.answer_kind,
    mediaId: r.media_id, position: r.position,
  };
}

async function ours(studioId: string, packageId: string): Promise<boolean> {
  const { data } = await db.from('packages')
    .select('id').eq('id', packageId).eq('studio_id', studioId).maybeSingle();
  return Boolean(data);
}

async function read(studioId: string, packageIds: string[]): Promise<PackageElement[]> {
  if (packageIds.length === 0) return [];
  const { data, error } = await db.from('package_elements').select(SELECT)
    .eq('studio_id', studioId).in('package_id', packageIds)
    .order('position', { ascending: true }).order('created_at', { ascending: true });
  if (error) {
    console.error('Could not read the package elements:', error);
    return [];
  }
  return ((data ?? []) as Row[]).map(shape);
}

/** For the studio's own pages. */
export async function elementsForPackages(packageIds: string[]): Promise<PackageElement[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  return read(who.studioId, packageIds);
}

/** For the public page, where nobody is signed in. */
export async function elementsOnOffer(
  studioId: string, packageIds: string[],
): Promise<PackageElement[]> {
  return read(studioId, packageIds);
}

export async function addElement(input: {
  packageId: string;
  type: ElementType;
  /**
   * Which catalogue row a `deliverable` promises. Checked against this
   * studio's own deliverables before it is written — an id arriving from a
   * form is a claim, and the foreign key alone would happily point this
   * package at another studio's catalogue.
   */
  deliverableId?: string;
  /** A shown picture or video must name the media it shows. */
  mediaId?: string | null;
  beforeId?: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  if (!await ours(who.studioId, input.packageId)) {
    throw new Error('That package is not in this studio');
  }

  if (input.type === 'deliverable') {
    if (!input.deliverableId) throw new Error('Say which deliverable');
    const { data: ours } = await db.from('deliverables')
      .select('id').eq('id', input.deliverableId)
      .eq('studio_id', who.studioId).maybeSingle();
    if (!ours) throw new Error('That is not in this studio');
  }

  /*
   * A deliverable appears ONCE in a package. Dropping "Edited image softcopy"
   * in again means the studio wants more of it, not a second entry — the
   * package used to end up with "6 ×" and "1 ×" as separate rows that read
   * as two different promises, and the offer merged them anyway. Raising the
   * count keeps what is shown and what is stored the same thing.
   */
  if (input.type === 'deliverable' && input.deliverableId) {
    const { data: already } = await db.from('package_elements')
      .select('id, count')
      .eq('studio_id', who.studioId)
      .eq('package_id', input.packageId)
      .eq('type', 'deliverable')
      .eq('deliverable_id', input.deliverableId)
      .maybeSingle();

    if (already) {
      const { error } = await db.from('package_elements')
        .update({ count: ((already.count as number | null) ?? 0) + 1 })
        .eq('id', already.id).eq('studio_id', who.studioId);
      if (error) {
        console.error('Could not add another of that deliverable:', error);
        throw new Error('Could not add that');
      }
      refreshBoth();
      return;
    }
  }

  const fresh = freshElement(input.type);
  /* A shown picture needs something to show, so naming media makes it shown. */
  const mode: ElementMode = input.mediaId ? 'shown' : fresh.mode;

  const { count } = await db.from('package_elements')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', who.studioId).eq('package_id', input.packageId);

  const existing = input.beforeId ? await read(who.studioId, [input.packageId]) : [];
  if (input.beforeId && !existing.some((e) => e.id === input.beforeId)) {
    throw new Error('That position is no longer in this package');
  }

  const { data: added, error } = await db.from('package_elements').insert({
    studio_id: who.studioId,
    package_id: input.packageId,
    type: input.type,
    mode,
    deliverable_id: input.deliverableId ?? null,
    count: fresh.count,
    body: fresh.body,
    detail: fresh.detail,
    answer_kind: input.type === 'ask' ? 'text' : null,
    media_id: input.mediaId ?? null,
    position: count ?? 0,
  }).select('id').single();

  if (error) {
    console.error('Could not add that element:', error);
    throw new Error('Could not add that');
  }
  if (input.beforeId && added) {
    const ids = existing.map((e) => e.id);
    ids.splice(ids.indexOf(input.beforeId), 0, added.id);
    const results = await Promise.all(ids.map((id, position) => db.from('package_elements')
      .update({ position }).eq('id', id).eq('studio_id', who.studioId)));
    if (results.some((result) => result.error)) throw new Error('Added, but could not arrange the element');
  }
  refreshBoth();
}

export async function amendElement(input: {
  elementId: string;
  mode?: ElementMode;
  count?: number | null;
  body?: string | null;
  detail?: string | null;
  answerKind?: AnswerKind;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: me } = await db.from('package_elements')
    .select('id, type, mode').eq('id', input.elementId)
    .eq('studio_id', who.studioId).maybeSingle();
  if (!me) throw new Error('That is not in this studio');

  const patch: Record<string, unknown> = {};
  if (input.mode !== undefined) {
    /* Only where the type allows both. A print nobody is making is not an
     * advertisement, and a paragraph is never something a client receives. */
    if (!MODES[(me as { type: ElementType }).type].includes(input.mode)) {
      throw new Error('That element cannot be shown and promised both ways');
    }
    patch.mode = input.mode;
  }
  if (input.count !== undefined) patch.count = input.count;
  if (input.body !== undefined) patch.body = input.body;
  if (input.detail !== undefined) patch.detail = input.detail?.trim() || null;
  if (input.answerKind !== undefined) patch.answer_kind = input.answerKind;

  if (Object.keys(patch).length === 0) return;

  const { error } = await db.from('package_elements').update(patch)
    .eq('id', input.elementId).eq('studio_id', who.studioId);
  if (error) {
    console.error('Could not change that element:', error);
    throw new Error('Could not change that');
  }
  refreshBoth();
}

export async function removeElement(input: { elementId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const { error } = await db.from('package_elements').delete()
    .eq('id', input.elementId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not remove that');
  refreshBoth();
}

/**
 * The whole order at once, as it is after a drag.
 *
 * Takes the ids rather than a from/to pair: a drag is a statement about the
 * final arrangement, and sending the arrangement is both simpler and immune
 * to the list having moved since.
 *
 * Every id is checked to belong to this package before anything is written,
 * so a tampered list cannot drag another studio's element into this one.
 */
export async function reorderElements(input: {
  packageId: string;
  ids: string[];
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const current = await read(who.studioId, [input.packageId]);
  const mine = new Set(current.map((e) => e.id));
  if (input.ids.length !== current.length || new Set(input.ids).size !== current.length || input.ids.some((id) => !mine.has(id))) {
    throw new Error('That is not this package’s order');
  }

  const results = await Promise.all(input.ids.map((id, i) => db.from('package_elements')
    .update({ position: i }).eq('id', id).eq('studio_id', who.studioId)));
  if (results.some((result) => result.error)) throw new Error('Could not save the order');

  refreshBoth();
}

/**
 * Move one earlier or later, for a keyboard.
 *
 * Kept beside the drag rather than replaced by it. A list that can only be
 * reordered by dragging cannot be reordered by somebody who does not use a
 * mouse, and "it is a visual tool" has never been a reason.
 *
 * Renumbered 0..n rather than swapping two values: positions drift — rows
 * arrive sharing one, a delete leaves a hole — and renumbering what is
 * already in hand ends the drift for nothing.
 */
export async function moveElement(input: {
  elementId: string;
  towards: 'front' | 'back';
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: me } = await db.from('package_elements')
    .select('id, package_id').eq('id', input.elementId)
    .eq('studio_id', who.studioId).maybeSingle();
  if (!me) throw new Error('That is not in this studio');

  const order = await read(who.studioId, [(me as { package_id: string }).package_id]);
  const at = order.findIndex((e) => e.id === input.elementId);
  const to = input.towards === 'front' ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= order.length) return;

  [order[at], order[to]] = [order[to], order[at]];

  await Promise.all(order.map((e, i) => db.from('package_elements')
    .update({ position: i }).eq('id', e.id).eq('studio_id', who.studioId)));

  refreshBoth();
}
