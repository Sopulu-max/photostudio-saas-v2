import type { Deliverable } from '@/weave/deliverables/shape';

/**
 * A package, as a document.
 *
 * An ordered list of typed elements, each of which is either SHOWN — the
 * studio fills it now and it sells the package — or PROMISED — the client
 * receives it. The same list renders twice: empty on the day somebody buys
 * it, full on the day the work arrives.
 *
 * What the package promises is a READING of this list, never a field somebody
 * types, so the two can never disagree.
 */

/**
 * `deliverable` is the one that carries the promise, and it points at the
 * studio's own catalogue rather than describing something in free text.
 * `picture`, `video` and `print` as PROMISES were three spellings of it and
 * have been converted; they survive here only so that rows written by a
 * previous deploy still read, and shown pictures and videos still use the
 * first two.
 */
export type ElementType =
  | 'deliverable' | 'ask' | 'picture' | 'video' | 'text' | 'print' | 'session';

/** How an answer is given. Three renderings the engine performs differently. */
export type AnswerKind = 'text' | 'date' | 'number';
export type ElementMode = 'shown' | 'promised';

export type PackageElement = {
  id: string;
  packageId: string;
  type: ElementType;
  mode: ElementMode;
  /** Which catalogue row is promised. Only a `deliverable` has one. */
  deliverableId: string | null;
  /** How many of it. Also how many outfits, how many hours. */
  count: number | null;
  /** What a text element says, or what an `ask` asks. */
  body: string | null;
  /** How an `ask` is answered. Null on everything else. */
  answerKind: AnswerKind | null;
  /** The studio's own words for a condition: "Outfits", "Hours". */
  detail: string | null;
  /** What a shown picture or video actually is. */
  mediaId: string | null;
  position: number;
};

/** Which types can be either side of the line, and which only one. */
export const MODES: Record<ElementType, ElementMode[]> = {
  /* Received, never shown: the catalogue is what the client gets. */
  deliverable: ['promised'],
  /*
   * The studio writes the question now, so it is shown. The ANSWER is not
   * this element's content — it is a fact about one booking, kept in
   * job_answers, which is why this did not need a third mode.
   */
  ask: ['shown'],
  /* A photograph the studio shows, to sell the package. */
  picture: ['shown'],
  video: ['shown'],
  text: ['shown'],
  /* Converted to `deliverable`; kept readable, never offered. */
  print: ['promised'],
  /* A condition of the day is spent, never shown. */
  session: ['promised'],
};

/** One line of what a client receives, in the studio's own words. */
export type Promised = {
  /** The element this came from. One per deliverable, so this is unambiguous. */
  elementId: string;
  deliverableId: string;
  /** Exactly as the studio typed it. Never re-cased, never pluralised. */
  name: string;
  count: number;
};

export type Promise_ = {
  /** What the client receives, by the studio's catalogue. */
  things: Promised[];
  /**
   * How many pictures land in the gallery, from native picture slots and
   * legacy deliverables marked as filling the gallery.
   */
  pictures: number;
  pictureSlots: number;
  films: number;
  /** Conditions of the day, by the studio's own name for them. */
  conditions: { detail: string; count: number }[];
};

/**
 * What this package promises, counted off the document.
 *
 * Nobody types these. Drag a deliverable in and the promise grows; drag it
 * out and it shrinks. That is the difference between a layout and a
 * description of one.
 *
 * The catalogue is passed in because an element holds an id, not a name: the
 * studio's word for the thing lives in one place, so renaming "8x10 framed"
 * renames it in every package that promises it.
 */
export function promisesOf(
  elements: PackageElement[],
  /*
   * Required, with no default. A default of [] let a caller that had not been
   * given the catalogue compile cleanly and then quietly report that the
   * package promises nothing — which is exactly what the public offer page
   * did for one commit.
   */
  catalogue: Deliverable[],
): Promise_ {
  const promised = elements.filter((e) => e.mode === 'promised');
  const byId = new Map(catalogue.map((d) => [d.id, d]));

  /* The same deliverable dropped in twice is one promise of the sum. */
  const things = new Map<string, Promised>();
  let legacyPictures = 0;
  let pictureSlots = 0;
  let films = 0;

  for (const e of promised) {
    const n = e.count ?? 0;
    if (n <= 0) continue;
    if (e.type === 'picture') { pictureSlots += n; continue; }
    if (e.type === 'video') { films += n; continue; }

    if (e.type !== 'deliverable' || !e.deliverableId) continue;
    const d = byId.get(e.deliverableId);
    if (!d) continue;

    const found = things.get(d.id);
    if (found) found.count += n;
    else things.set(d.id, { elementId: e.id, deliverableId: d.id, name: d.name, count: n });

    if (d.fillsGallery) legacyPictures += n;
  }

  /*
   * Conditions of the same name are ONE condition. Two "Outfits" elements of
   * two each is four outfits on the day, not "2 outfits, 2 outfits" — which
   * says nothing a client can act on. Matched without regard to case, but the
   * studio's own spelling is what shows.
   */
  const byName = new Map<string, { detail: string; count: number }>();
  for (const e of promised) {
    if (e.type !== 'session') continue;
    const detail = e.detail?.trim() || 'Included';
    const found = byName.get(detail.toLowerCase());
    if (found) found.count += e.count ?? 0;
    else byName.set(detail.toLowerCase(), { detail, count: e.count ?? 0 });
  }

  return {
    things: [...things.values()],
    pictures: legacyPictures + pictureSlots,
    pictureSlots,
    films,
    conditions: [...byName.values()].filter((c) => c.count > 0),
  };
}

/**
 * What the package promises, said back.
 *
 * "6 × Edited image softcopy" rather than "6 edited image softcopies": the
 * studio's word is shown exactly as typed, and a multiplier states the count
 * without inflecting somebody else's noun.
 */
export function sayPromises(p: Promise_): string {
  const bits: string[] = [];
  if (p.pictureSlots > 0) bits.push(`${p.pictureSlots} ${p.pictureSlots === 1 ? 'image' : 'images'}`);
  if (p.films > 0) bits.push(`${p.films} ${p.films === 1 ? 'film' : 'films'}`);
  for (const t of p.things) bits.push(`${t.count} × ${t.name}`);
  for (const c of p.conditions) bits.push(`${c.count} ${c.detail}`);
  return bits.length === 0 ? 'No promise set' : bits.join(', ');
}

/** Whether anything at all is promised. A package promising nothing cannot be sold. */
export function promisesAnything(p: Promise_): boolean {
  return p.pictures > 0 || p.films > 0 || p.things.length > 0 || p.conditions.length > 0;
}

/** What a new element of this type starts as. */
export function freshElement(type: ElementType): {
  mode: ElementMode; count: number | null; body: string | null; detail: string | null;
} {
  switch (type) {
    case 'deliverable': return { mode: 'promised', count: 1, body: null, detail: null };
    /* A question starts with wording, because the database refuses a blank
     * one: an unlabelled input on a public page cannot be answered. */
    case 'ask': return { mode: 'shown', count: null, body: 'Your question', detail: null };
    case 'session': return { mode: 'promised', count: 2, body: null, detail: 'Outfits' };
    case 'print': return { mode: 'promised', count: 1, body: null, detail: null };
    case 'picture':
    case 'video': return { mode: 'shown', count: null, body: null, detail: null };
    case 'text': return { mode: 'shown', count: null, body: '', detail: null };
  }
}
