import { describe, it, expect } from 'vitest';
import { promisesOf, sayPromises, type PackageElement } from '@/weave/packages/elements';
import {
  isPublished, sayPackage, sayPromise, sayPromiseToClient, sayShape, slotSize, standingOfPromise, type Package,
} from '@/weave/packages/shape';

/**
 * A package promises; a gallery holds the promise.
 *
 * The whole argument is that the promise is a COUNT and how full a gallery
 * is is derived from it — never four hundred empty rows, which would be
 * fabricating structure and would disagree with the package the first time
 * one of them changed. These hold that derivation.
 */
const pack = (over: Partial<Package> = {}): Package => ({
  id: 'p', name: 'The whole wedding day', about: null, price: 85_000_00,
  currency: 'NGN', picturesPromised: 400, galleryTemplateId: null,
  publishedAt: null, position: 0, ...over,
});

describe('what shape a package makes', () => {
  it('states the plain case rather than leaving a gap', () => {
    expect(sayShape(null)).toBe('Opens a plain gallery');
  });

  it('names the template and how much structure it carries', () => {
    expect(sayShape({ name: 'Wedding booklet', sections: [1, 2, 3] }))
      .toBe('Opens a Wedding booklet gallery, 3 sections');
  });

  it('counts one section as one', () => {
    expect(sayShape({ name: 'Portrait', sections: [1] }))
      .toBe('Opens a Portrait gallery, 1 section');
  });

  it('says nothing about sections when a template has none', () => {
    expect(sayShape({ name: 'Bare', sections: [] })).toBe('Opens a Bare gallery');
  });

  /* A studio's own words, unaltered — not title-cased, not truncated. */
  it('leaves the studio\'s name for the template exactly as typed', () => {
    expect(sayShape({ name: 'the BIG day', sections: [1] }))
      .toBe('Opens a the BIG day gallery, 1 section');
  });
});

describe('what a package says', () => {
  it('reads the picture and film slots in a migrated package', () => {
    const picture: PackageElement = {
      id: 'picture', packageId: 'p', type: 'picture', mode: 'promised', count: 7,
      deliverableId: null, body: null, answerKind: null, detail: null, mediaId: null, position: 0,
    };
    const film: PackageElement = { ...picture, id: 'film', type: 'video', count: 1 };
    const promise = promisesOf([picture, film], []);
    expect(promise.pictures).toBe(7);
    expect(sayPromises(promise)).toBe('7 images, 1 film');
  });

  it('leads with the promise, because that is what is being bought', () => {
    expect(sayPackage(pack())).toBe('400 edited images');
  });

  it('says a promise is missing rather than leaving a gap', () => {
    expect(sayPackage(pack({ picturesPromised: null })))
      .toBe('Image count not set');
  });

  it('counts one picture as one', () => {
    expect(sayPackage(pack({ picturesPromised: 1 }))).toBe('1 edited image');
  });

  it('is only offered once it has been published', () => {
    expect(isPublished(pack())).toBe(false);
    expect(isPublished(pack({ publishedAt: '2026-11-20T00:00:00Z' }))).toBe(true);
  });
});

describe('a gallery against its promise', () => {
  it('is filling while there is room', () => {
    expect(standingOfPromise(120, 400))
      .toEqual({ kind: 'filling', have: 120, promised: 400, left: 280 });
  });

  it('is met exactly on the number, not approximately', () => {
    expect(standingOfPromise(400, 400).kind).toBe('met');
  });

  /*
   * Past the promise is not an error — it is the studio giving more, or the
   * client buying extras. Either way it should be visible rather than
   * discovered in an argument.
   */
  it('is over when there are more than were promised', () => {
    expect(standingOfPromise(412, 400))
      .toEqual({ kind: 'over', have: 412, promised: 400, extra: 12 });
  });

  it('has no standing to report when nothing was promised', () => {
    expect(standingOfPromise(37, null)).toEqual({ kind: 'unpromised', have: 37 });
  });
});

describe('how the promise is said', () => {
  it('tells the studio what is left to do', () => {
    expect(sayPromise(0, 400)).toBe('0 of 400 delivered. 400 outstanding.');
    expect(sayPromise(400, 400)).toBe('400 of 400 delivered.');
    expect(sayPromise(412, 400)).toBe('412 delivered. 12 above the agreed 400.');
  });

  it('says the absence of a promise rather than nothing at all', () => {
    expect(sayPromise(0, null)).toBe('No images. No count agreed.');
    expect(sayPromise(9, null)).toBe('9 images. No count agreed.');
  });

  /*
   * The client is owed a different sentence. "400 still to come" is the
   * studio's workload; what the client wants to know is what they are
   * getting against what they agreed.
   */
  it('says something else entirely to the client', () => {
    expect(sayPromiseToClient(120, 400)).toBe('120 of 400 images delivered.');
    expect(sayPromiseToClient(412, 400))
      .toBe('412 images delivered, 12 above your package.');
  });

  it('says nothing to a client who was promised no number', () => {
    expect(sayPromiseToClient(9, null)).toBeNull();
  });
});

describe('how big to draw what was promised', () => {
  /*
   * Four squares say "these are yours"; four hundred marks say "that many".
   * Both are drawn in full, because capping the count and writing "+376
   * more" turns the shape back into a figure with a caption.
   */
  it('draws a handful large enough to count', () => {
    expect(slotSize(1)).toBe('large');
    expect(slotSize(4)).toBe('large');
    expect(slotSize(8)).toBe('large');
  });

  it('shrinks once there are too many to count at a glance', () => {
    expect(slotSize(9)).toBe('medium');
    expect(slotSize(48)).toBe('medium');
  });

  it('goes to marks when the number is the point', () => {
    expect(slotSize(49)).toBe('small');
    expect(slotSize(400)).toBe('small');
    expect(slotSize(5000)).toBe('small');
  });
});
