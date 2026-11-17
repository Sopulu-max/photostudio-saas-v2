/**
 * A file the studio holds.
 *
 * No state column. Whether something is a raw, an edit or a select is derived:
 * an edit knows its original through `derivedFrom`, and what was chosen is a
 * separate record carrying WHO chose it, because a studio's selects and a
 * client's favourites are the same act by different people.
 */
export type StudioFile = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  derivedFrom: string | null;
  occasionId: string | null;
  addedAt: string;
  /** Short-lived signed URL. The bucket is private; nothing is reachable by path. */
  url: string | null;
  chosenBy: { personId: string; name: string }[];
};

export function isImage(f: StudioFile): boolean {
  return (f.mimeType ?? '').startsWith('image/');
}

export function isVideo(f: Pick<StudioFile, 'mimeType'>): boolean {
  return (f.mimeType ?? '').startsWith('video/');
}

/** Sizes said the way a person says them, not in bytes. */
export function saySize(bytes: number | null): string {
  if (bytes === null) return 'Size unknown';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

/**
 * What the set of files amounts to, as a sentence.
 *
 * A count on its own informs nobody — "412 files" is a number, while "412
 * files, 38 chosen" is the state of the job's post-production.
 */
export function sayFiles(files: StudioFile[]): string {
  if (files.length === 0) return 'No files yet.';
  const chosen = files.filter((f) => f.chosenBy.length > 0).length;
  const many = `${files.length} ${files.length === 1 ? 'file' : 'files'}`;
  return chosen === 0 ? `${many}, none chosen yet.` : `${many}, ${chosen} chosen.`;
}
