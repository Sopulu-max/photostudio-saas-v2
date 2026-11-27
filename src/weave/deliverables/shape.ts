/**
 * What a studio delivers.
 *
 * The catalogue of things this studio hands over — a retouched image, a
 * highlight film, an 8×10 framed print. A deliverable has NO price: what it
 * costs is a fact about selling it, and belongs to the price list that sells
 * it. A package includes deliverables that are already paid for.
 */

/**
 * Two, and only two, because the engine performs exactly two acts: a digital
 * thing is fulfilled by handing over the file, a physical thing has to be
 * made and sent. Lustre or matte, album or canvas, is the studio's own word.
 */
export type DeliverableKind = 'digital' | 'physical';

/** How the engine draws it on a wall. Three distinct renderings. */
export type ShownAs = 'print' | 'framed' | 'canvas';

export type Deliverable = {
  id: string;
  /** The studio's own word, shown exactly as typed. */
  name: string;
  kind: DeliverableKind;
  /** Millimetres, stated by the studio. Physical things only. */
  widthMm: number | null;
  heightMm: number | null;
  shownAs: ShownAs | null;
  /**
   * This deliverable arrives as the pictures IN a gallery, so a package
   * promising it sets that gallery's size. Said by the studio about its own
   * catalogue, because `kind` cannot answer it: a highlight film is digital
   * too, and six edited images plus one film is not seven pictures.
   */
  fillsGallery: boolean;
  position: number;
};

/** Inches, for a studio that thinks in them. One decimal, trailing zero cut. */
function inches(mm: number): string {
  const n = Math.round((mm / 25.4) * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * The size, in the units a photographer says out loud.
 *
 * Stored in millimetres because that is unambiguous, said in inches because
 * that is what "8×10" means to the person reading it.
 */
export function saySize(d: Deliverable): string | null {
  if (d.widthMm === null || d.heightMm === null) return null;
  return `${inches(d.widthMm)}×${inches(d.heightMm)}in`;
}

/**
 * What this is, in one line.
 *
 * Leads with what the engine will actually do, because that is the part a
 * studio cannot see by reading the name: "Album" tells you nothing about
 * whether somebody has to post it.
 */
export function sayDeliverable(d: Deliverable): string {
  if (d.kind === 'digital') return 'A file, handed over';
  const size = saySize(d);
  const shown = d.shownAs ?? 'print';
  return size ? `${shown}, ${size}, made and posted` : `${shown}, made and posted`;
}

/** Whether this is something that gets hung, and so can stand in a room scene. */
export function hangs(d: Deliverable): boolean {
  return d.kind === 'physical' && d.widthMm !== null && d.heightMm !== null;
}
