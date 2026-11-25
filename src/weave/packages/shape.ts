/**
 * What a studio offers, and what it promises.
 *
 * A package does not describe a gallery — it produces one. Accepting a
 * booking instantiates the work: the job, what happens on it, and a gallery
 * sized by what was agreed. That is what stops a package being a sentence.
 */

export type Package = {
  id: string;
  name: string;
  about: string | null;
  price: number | null;
  currency: string;
  /** Finished pictures the client gets back. Null means not said yet. */
  picturesPromised: number | null;
  /**
   * The shape the gallery starts in. A package produces a gallery; this is
   * what that gallery looks like on the day it is born — cover, theme and
   * sections. Null means plain, which is what it was before.
   */
  galleryTemplateId: string | null;
  publishedAt: string | null;
  position: number;
};

/** Offered at the studio's public address. A thing that happened, not a status. */
export function isPublished(p: Package): boolean {
  return p.publishedAt !== null;
}

/**
 * How a package says itself to somebody deciding.
 *
 * The promise first, because that is what they are buying. A package with no
 * promise says so rather than leaving a gap — "we have not said" is a fact a
 * client can act on; silence is not.
 */
export function sayPackage(p: Package): string {
  const pictures = p.picturesPromised === null
    ? 'Image count not set'
    : `${p.picturesPromised} edited ${p.picturesPromised === 1 ? 'image' : 'images'}`;
  return pictures;
}

/**
 * What shape the gallery it produces starts in.
 *
 * A statement, not a label beside a value: a package that names no template
 * makes a plain gallery, and saying so is a fact the studio can act on. The
 * section count is there because it is the part that is actually visible on
 * the day — a cover and a theme are taste, sections are structure.
 */
export function sayShape(template: { name: string; sections: unknown[] } | null): string {
  if (!template) return 'Opens a plain gallery';
  const n = template.sections.length;
  if (n === 0) return `Opens a ${template.name} gallery`;
  return `Opens a ${template.name} gallery, ${n} ${n === 1 ? 'section' : 'sections'}`;
}

/**
 * How big to draw each container.
 *
 * A promise of four and a promise of four hundred are different pictures, and
 * both should be drawn in full — four large squares say "these are yours",
 * four hundred small marks say "that many". Capping the count and writing
 * "+376 more" would turn the shape back into a number with a label, which is
 * the thing a reading must never be.
 */
export type SlotSize = 'large' | 'medium' | 'small';

export function slotSize(promised: number): SlotSize {
  if (promised <= 8) return 'large';
  if (promised <= 48) return 'medium';
  return 'small';
}

/**
 * How full a gallery is against what was promised.
 *
 * DERIVED, every time. The promise is a count, never four hundred empty rows:
 * materialising it would be fabricating structure, and the rows would
 * disagree with the package the first time one of them changed.
 *
 * Past the promise is not an error. It is the studio giving more than it
 * agreed, or extras the client is buying, and either way somebody should be
 * able to see it rather than discover it in an argument.
 */
export type Standing =
  | { kind: 'unpromised'; have: number }
  | { kind: 'filling'; have: number; promised: number; left: number }
  | { kind: 'met'; have: number; promised: number }
  | { kind: 'over'; have: number; promised: number; extra: number };

export function standingOfPromise(have: number, promised: number | null): Standing {
  if (promised === null) return { kind: 'unpromised', have };
  if (have > promised) return { kind: 'over', have, promised, extra: have - promised };
  if (have === promised) return { kind: 'met', have, promised };
  return { kind: 'filling', have, promised, left: promised - have };
}

/** Said to the studio, as a state of the work rather than a ratio. */
export function sayPromise(have: number, promised: number | null): string {
  const s = standingOfPromise(have, promised);
  switch (s.kind) {
    case 'unpromised':
      return s.have === 0
        ? 'No images. No count agreed.'
        : `${s.have} images. No count agreed.`;
    case 'filling':
      return `${s.have} of ${s.promised} delivered. ${s.left} outstanding.`;
    case 'met':
      return `${s.promised} of ${s.promised} delivered.`;
    case 'over':
      return `${s.have} delivered. ${s.extra} above the agreed ${s.promised}.`;
  }
}

/** Said to the client, who is owed a different sentence from the studio's. */
export function sayPromiseToClient(have: number, promised: number | null): string | null {
  const s = standingOfPromise(have, promised);
  if (s.kind === 'unpromised') return null;
  if (s.kind === 'filling') {
    return `${s.have} of ${s.promised} images delivered.`;
  }
  if (s.kind === 'met') return `All ${s.promised} images delivered.`;
  return `${s.have} images delivered, ${s.extra} above your package.`;
}
