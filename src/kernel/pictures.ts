/**
 * Pictures, gathered.
 *
 * A booking has no pictures of its own beyond the one cover a studio may give
 * it. What it has is packages, and packages have pictures — so a booking's
 * pictures are a READING of the packages in it, never a second store. This is
 * the same rule as a package's cover being its first slide, one edge further
 * out: relatedness is derived, not declared.
 *
 * RANDOM, BUT THE SAME RANDOM EVERY TIME. "A slide of random pictures" was the
 * ask, and a genuinely random order would be a different order on the server
 * and on the client, which React refuses to hydrate — the page would flash and
 * then rebuild. It would also be a different order on every reload, so a
 * booking would never look like itself twice. Seeded by the booking's own id,
 * the order is arbitrary in the way that was wanted and fixed in the way that
 * was not: it looks shuffled, and it is the same shuffle tomorrow.
 */

export type Picture = { url: string; position: string | null };

/** A small, fast hash of a string into a 32-bit seed. FNV-1a. */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: a tiny deterministic generator, good enough to shuffle a list. */
function randomFrom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, driven by the seed. The same input and seed give the same order. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const next = randomFrom(seedOf(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The most a surface is asked to show — the same twenty a package may hold. */
export const MAX_PICTURES = 20;

/**
 * A booking's pictures.
 *
 * ITS OWN COVER LEADS, when it has one. A studio that uploaded a picture for
 * this booking — the client's own face, the actual venue — said something
 * more specific than any package can, and that is what a link preview and a
 * list row should carry. The packages' pictures follow, shuffled, so a booking
 * for two packages with the same stock photograph does not open on it twice.
 *
 * Capped at twenty, the same twenty a single package may hold, because these
 * are drawn on the same surfaces for the same reasons.
 */
export function gatherPictures(input: {
  seed: string;
  own?: Picture | null;
  from: Picture[][];
}): Picture[] {
  const seen = new Set<string>();
  const keep = (p: Picture | null | undefined): p is Picture => {
    if (!p || !p.url || seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  };

  const lead = keep(input.own) ? [input.own!] : [];
  const rest = seededShuffle(input.from.flat().filter(keep), input.seed);
  return [...lead, ...rest].slice(0, MAX_PICTURES);
}
