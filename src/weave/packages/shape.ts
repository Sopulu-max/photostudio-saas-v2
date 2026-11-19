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
    ? 'Number of pictures not said yet'
    : `${p.picturesPromised} finished ${p.picturesPromised === 1 ? 'picture' : 'pictures'}`;
  return pictures;
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
        ? 'Nothing in it yet, and no number promised.'
        : `${s.have} in it. No number was promised.`;
    case 'filling':
      return `${s.have} of ${s.promised}. ${s.left} still to come.`;
    case 'met':
      return `All ${s.promised} promised pictures are in.`;
    case 'over':
      return `${s.have} in it — ${s.extra} past the ${s.promised} promised.`;
  }
}

/** Said to the client, who is owed a different sentence from the studio's. */
export function sayPromiseToClient(have: number, promised: number | null): string | null {
  const s = standingOfPromise(have, promised);
  if (s.kind === 'unpromised') return null;
  if (s.kind === 'filling') {
    return `${s.have} of the ${s.promised} in your package so far.`;
  }
  if (s.kind === 'met') return `All ${s.promised} pictures in your package.`;
  return `${s.have} pictures — ${s.extra} more than your package included.`;
}
