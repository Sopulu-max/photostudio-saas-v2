import { describe, it, expect } from 'vitest';
import {
  isPublished, sayPackage, sayPromise, sayPromiseToClient, standingOfPromise, type Package,
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
  currency: 'NGN', picturesPromised: 400, publishedAt: null, position: 0, ...over,
});

describe('what a package says', () => {
  it('leads with the promise, because that is what is being bought', () => {
    expect(sayPackage(pack())).toBe('400 finished pictures');
  });

  it('says a promise is missing rather than leaving a gap', () => {
    expect(sayPackage(pack({ picturesPromised: null })))
      .toBe('Number of pictures not said yet');
  });

  it('counts one picture as one', () => {
    expect(sayPackage(pack({ picturesPromised: 1 }))).toBe('1 finished picture');
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
    expect(sayPromise(0, 400)).toBe('0 of 400. 400 still to come.');
    expect(sayPromise(400, 400)).toBe('All 400 promised pictures are in.');
    expect(sayPromise(412, 400)).toBe('412 in it — 12 past the 400 promised.');
  });

  it('says the absence of a promise rather than nothing at all', () => {
    expect(sayPromise(0, null)).toBe('Nothing in it yet, and no number promised.');
    expect(sayPromise(9, null)).toBe('9 in it. No number was promised.');
  });

  /*
   * The client is owed a different sentence. "400 still to come" is the
   * studio's workload; what the client wants to know is what they are
   * getting against what they agreed.
   */
  it('says something else entirely to the client', () => {
    expect(sayPromiseToClient(120, 400)).toBe('120 of the 400 in your package so far.');
    expect(sayPromiseToClient(412, 400))
      .toBe('412 pictures — 12 more than your package included.');
  });

  it('says nothing to a client who was promised no number', () => {
    expect(sayPromiseToClient(9, null)).toBeNull();
  });
});
