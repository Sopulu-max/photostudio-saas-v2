import { describe, it, expect } from 'vitest';
import { gatherPictures, seededShuffle, MAX_PICTURES } from '@/kernel/pictures';

/**
 * A booking's pictures are a reading of the packages in it.
 *
 * No database: this is the derivation itself, and what is pinned is the part
 * that is invisible when it is wrong. That "random" is the SAME random every
 * time — a different order on the server and the client is a page React
 * refuses to hydrate, and a different order on every reload is a booking that
 * never looks like itself twice. That the booking's own cover leads when it has
 * one, because it says something more specific than any package can. And that
 * two packages sharing a photograph do not show it twice.
 */

const pic = (n: string) => ({ url: `https://example.test/${n}.webp`, position: null });

describe('a seeded shuffle', () => {
  it('is the same order for the same seed, and a different one for another', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const once = seededShuffle(items, 'booking-1');
    const again = seededShuffle(items, 'booking-1');
    const other = seededShuffle(items, 'booking-2');

    expect(again, 'the same seed gave a different order').toEqual(once);
    expect(once, 'the shuffle did nothing').not.toEqual(items);
    expect(other, 'two seeds gave the same order').not.toEqual(once);
    expect([...once].sort(), 'the shuffle lost or invented an item').toEqual([...items].sort());
  });

  it('leaves its input alone', () => {
    const items = ['a', 'b', 'c'];
    seededShuffle(items, 'x');
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe("a booking's pictures", () => {
  it('leads with its own cover, then the packages, shuffled', () => {
    const own = pic('the-client-herself');
    const got = gatherPictures({
      seed: 'booking-7',
      own,
      from: [[pic('p1a'), pic('p1b')], [pic('p2a'), pic('p2b'), pic('p2c')]],
    });

    expect(got[0], "the booking's own cover did not lead").toEqual(own);
    expect(got.length).toBe(6);
    expect(got.slice(1).map((p) => p.url).sort()).toEqual(
      ['p1a', 'p1b', 'p2a', 'p2b', 'p2c'].map((n) => pic(n).url).sort(),
    );
  });

  it('is the same set in the same order tomorrow', () => {
    const from = [[pic('a'), pic('b'), pic('c')], [pic('d'), pic('e')]];
    const today = gatherPictures({ seed: 'booking-9', from });
    const tomorrow = gatherPictures({ seed: 'booking-9', from });
    expect(tomorrow, 'a booking did not look like itself twice').toEqual(today);
  });

  it('shows a photograph two packages share only once', () => {
    const shared = pic('studio-stock');
    const got = gatherPictures({ seed: 's', from: [[shared, pic('x')], [shared, pic('y')]] });
    expect(got.filter((p) => p.url === shared.url).length, 'a shared picture appeared twice').toBe(1);
    expect(got.length).toBe(3);
  });

  it('does not repeat its own cover when a package holds the same picture', () => {
    const same = pic('same');
    const got = gatherPictures({ seed: 's', own: same, from: [[same, pic('other')]] });
    expect(got.map((p) => p.url)).toEqual([same.url, pic('other').url]);
  });

  it('is nothing at all for a booking with no cover and no packages', () => {
    expect(gatherPictures({ seed: 'empty', from: [] })).toEqual([]);
    expect(gatherPictures({ seed: 'empty', own: null, from: [[]] })).toEqual([]);
  });

  it('stops at twenty, and the cover is never the one dropped', () => {
    const own = pic('own');
    const many = Array.from({ length: 30 }, (_, i) => pic(`n${i}`));
    const got = gatherPictures({ seed: 'big', own, from: [many] });
    expect(got.length).toBe(MAX_PICTURES);
    expect(got[0]).toEqual(own);
  });
});
