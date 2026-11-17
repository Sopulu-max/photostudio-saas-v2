/**
 * A gallery, from the two sides it is seen from.
 *
 * The studio sees a summary — what it is called, how much is in it, whether it
 * is open. The client sees the pictures and nothing about the job behind them.
 */

export type GallerySummary = {
  id: string;
  name: string;
  token: string;
  sharedAt: string | null;
  mayDownload: boolean;
  howMany: number;
  /** Null means nothing is for sale in it, which is most galleries. */
  priceListId: string | null;
};

export type PublicGallery = {
  id: string;
  name: string;
  token: string;
  studioName: string;
  mayDownload: boolean;
  files: { id: string; name: string; mimeType: string | null; url: string | null }[];
};

/**
 * Where a gallery stands, as a sentence rather than a badge.
 *
 * Absence is stated: a gallery with nothing in it is a different problem from
 * one that is full and unshared, and both are things somebody has to act on.
 */
export function sayGallery(g: GallerySummary): string {
  if (g.howMany === 0) return 'Empty, nothing to send yet';
  const many = `${g.howMany} ${g.howMany === 1 ? 'picture' : 'pictures'}`;
  return g.sharedAt ? `${many}, open to the client` : `${many}, not sent yet`;
}
