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
  expiresOn: string | null;
  accessMode: 'link' | 'code';
  mayDownload: boolean;
  howMany: number;
  coverFileId: string | null;
  sections: GallerySectionSummary[];
  members: GalleryMemberSummary[];
  collections: GalleryCollectionSummary[];
  comments: GalleryCommentSummary[];
  /** Null means nothing is for sale in it, which is most galleries. */
  priceListId: string | null;
};

export type GallerySectionSummary = {
  id: string;
  name: string;
  position: number;
  visibleToClients: boolean;
  howMany: number;
};

export type GalleryMemberSummary = {
  fileId: string;
  name: string;
  mimeType: string | null;
  sectionId: string;
};

export type GalleryCollectionSummary = {
  id: string;
  name: string;
  kind: 'collection' | 'selection';
  ownerName: string;
  ownerEmail: string | null;
  maxItems: number | null;
  dueOn: string | null;
  submittedAt: string | null;
  howMany: number;
};

export type GalleryCommentSummary = {
  id: string;
  body: string;
  authorName: string;
  fileName: string;
  createdAt: string;
};

export type ClientGalleryCollection = {
  id: string;
  name: string;
  kind: 'collection' | 'selection';
  maxItems: number | null;
  dueOn: string | null;
  submittedAt: string | null;
  fileIds: string[];
};

/** A gallery dashboard is a reading of interaction events, never a second log. */
export type GalleryActivity = {
  galleryId: string;
  opens: number;
  downloads: number;
  comments: number;
  favourites: number;
  collectionAdds: number;
  selectionsSubmitted: number;
  orders: number;
  recent: { id: string; action: string; at: string; who: string | null }[];
};

export type GalleryTemplate = {
  id: string;
  name: string;
  mayDownload: boolean;
  priceListId: string | null;
  sections: { id: string; name: string; position: number; visibleToClients: boolean }[];
};

export type PublicGalleryFile = {
  id: string;
  name: string;
  mimeType: string | null;
  url: string | null;
};

export type PublicGallerySection = {
  id: string;
  name: string;
  files: PublicGalleryFile[];
};

export type PublicGallery = {
  id: string;
  name: string;
  token: string;
  studioName: string;
  mayDownload: boolean;
  coverFileId: string | null;
  sections: PublicGallerySection[];
  files: PublicGalleryFile[];
};

/** A public address can reveal that a gallery exists without revealing its media. */
export type LockedGallery = {
  locked: true;
  name: string;
  token: string;
  studioName: string;
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
  if (!g.sharedAt) return `${many}, not sent yet`;
  if (g.expiresOn) return `${many}, open until ${g.expiresOn}`;
  return `${many}, open to the client`;
}
