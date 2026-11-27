import { weave as db } from '@/weave/db';
import type { PackageElement } from './elements';
import type { Deliverable } from '@/weave/deliverables/shape';

/**
 * What a package promises, read off its elements.
 *
 * Deliberately NOT in elementActions.ts: that file is `'use server'`, so
 * every export there is a public endpoint, and an endpoint taking a
 * studio_id as an argument is a tenancy hole wearing a parameter. These
 * functions take a studio id because their callers already established it.
 */

type Row = {
  id: string; package_id: string; type: PackageElement['type'];
  mode: PackageElement['mode']; deliverable_id: string | null;
  count: number | null; body: string | null; detail: string | null;
  answer_kind: PackageElement['answerKind'];
  media_id: string | null; position: number;
};

const SELECT = 'id, package_id, type, mode, deliverable_id, count, body, detail, answer_kind, media_id, position';

/** Every element of these packages, in the order a client meets them. */
export async function elementsOf(
  studioId: string, packageIds: string[],
): Promise<PackageElement[]> {
  if (packageIds.length === 0) return [];
  const { data, error } = await db.from('package_elements').select(SELECT)
    .eq('studio_id', studioId).in('package_id', packageIds)
    .order('position', { ascending: true }).order('created_at', { ascending: true });
  if (error) {
    console.error('Could not read the package elements:', error);
    return [];
  }
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id, packageId: r.package_id, type: r.type, mode: r.mode,
    deliverableId: r.deliverable_id, count: r.count, body: r.body, detail: r.detail,
    answerKind: r.answer_kind,
    mediaId: r.media_id, position: r.position,
  }));
}

/**
 * This studio's catalogue, for counting a promise against.
 *
 * Read here rather than through the deliverables action, which is a
 * `'use server'` endpoint and takes no studio id by design.
 */
export async function catalogueOf(studioId: string): Promise<Deliverable[]> {
  const { data, error } = await db.from('deliverables')
    .select('id, name, kind, width_mm, height_mm, shown_as, fills_gallery, position')
    .eq('studio_id', studioId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Could not read the catalogue:', error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string, name: r.name as string,
    kind: r.kind as Deliverable['kind'],
    widthMm: r.width_mm as number | null, heightMm: r.height_mm as number | null,
    shownAs: r.shown_as as Deliverable['shownAs'],
    fillsGallery: r.fills_gallery as boolean,
    position: r.position as number,
  }));
}
