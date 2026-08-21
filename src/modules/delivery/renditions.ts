/**
 * What the gallery actually puts on the wire.
 *
 * Storage holds one file per asset — the original, which for a photographer is
 * routinely 8-25MB. Serving those into a grid and letting CSS shrink them meant
 * a 400-image gallery moved several gigabytes to show a page of thumbnails, so
 * these are rendered by Supabase's image transform endpoint instead.
 *
 * `original` is deliberately not in the map: it means "no transform", and it is
 * what a download hands over, because a client who paid for the photograph gets
 * the photograph and not a resample of it.
 *
 * This sits outside `domain.ts` because that file is `'use server'` and may only
 * export async functions; it reaches the outside world through `interface.ts`
 * like everything else in the module.
 */
export const GALLERY_RENDITIONS = {
  grid: { width: 800, quality: 74 },
  full: { width: 2400, quality: 86 },
} as const;

export type GalleryRendition = keyof typeof GALLERY_RENDITIONS | 'original';

export function isGalleryRendition(value: string): value is GalleryRendition {
  return value === 'original' || value in GALLERY_RENDITIONS;
}
