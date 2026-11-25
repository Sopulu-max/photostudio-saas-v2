/**
 * What a gallery is born as.
 *
 * Two things create galleries and they disagreed. `makeGallery` seeded design
 * and sections from a template; `galleryForAcceptedJob` — the path that runs
 * on its own, without anybody choosing anything — inserted a bare row with no
 * design and NO SECTIONS, and `fillGallery` cannot put a picture into a
 * gallery that has none. So the automatic path produced a gallery the studio
 * had to repair by hand before it could be used.
 *
 * The seeding lives here so there is one answer to "what does a new gallery
 * look like", read by both.
 *
 * No 'use server': this is called from server actions, not from a form. The
 * caller has already established who is asking and passes the studio down,
 * so nothing here is a trust boundary of its own — it is given a studio id
 * and refuses to look outside it.
 */

import { weave as db } from '@/weave/db';
import type { GalleryDesign } from './shape';

export type TemplateSeed = {
  may_download: boolean;
  price_list_id: string | null;
  gallery_theme: GalleryDesign['theme'];
  gallery_font: GalleryDesign['font'];
  gallery_grid: GalleryDesign['grid'];
  cover_style: GalleryDesign['coverStyle'];
  sections: { name: string; position: number; visible_to_clients: boolean }[];
};

const TEMPLATE_SELECT = 'may_download, price_list_id, gallery_theme, gallery_font, '
  + 'gallery_grid, cover_style, '
  + 'sections:gallery_template_sections(name, position, visible_to_clients)';

/**
 * Scoped to the studio, every time. A template id arriving from a package or
 * a form is an id somebody could have typed.
 */
export async function readTemplate(
  studioId: string,
  templateId: string | null | undefined,
): Promise<TemplateSeed | null> {
  if (!templateId) return null;
  const { data, error } = await db.from('gallery_templates')
    .select(TEMPLATE_SELECT)
    .eq('id', templateId).eq('studio_id', studioId).maybeSingle();
  if (error || !data) return null;
  return data as unknown as TemplateSeed;
}

/** The same defaults a gallery has always had when nothing was chosen. */
export function designFrom(template: TemplateSeed | null) {
  return {
    may_download: template?.may_download ?? true,
    price_list_id: template?.price_list_id ?? null,
    gallery_theme: template?.gallery_theme ?? 'paper',
    gallery_font: template?.gallery_font ?? 'modern',
    gallery_grid: template?.gallery_grid ?? 'story',
    cover_style: template?.cover_style ?? 'single',
  };
}

/**
 * Always at least one section. A gallery with none cannot be filled, so
 * "no template" means one plain section rather than nothing.
 */
export function sectionsFrom(template: TemplateSeed | null) {
  const seed = template?.sections?.length
    ? [...template.sections].sort((a, b) => a.position - b.position)
    : [{ name: 'Gallery', position: 0, visible_to_clients: true }];
  return seed;
}

/**
 * Writes the sections for a gallery that has just been inserted.
 *
 * Returns them in order, because the caller usually wants the first one to
 * put files into.
 */
export async function writeSections(input: {
  studioId: string;
  galleryId: string;
  template: TemplateSeed | null;
}): Promise<{ id: string; position: number }[]> {
  const { data, error } = await db
    .from('gallery_sections')
    .insert(sectionsFrom(input.template).map((section) => ({
      studio_id: input.studioId,
      gallery_id: input.galleryId,
      name: section.name,
      position: section.position,
      visible_to_clients: section.visible_to_clients,
    })))
    .select('id, position')
    .order('position', { ascending: true });

  if (error) {
    console.error('Failed to make the gallery sections:', error);
    return [];
  }
  return (data ?? []) as { id: string; position: number }[];
}
