import { describe, it, expect } from 'vitest';
import { clashesIn, sayClashes, weeksOf, type Occasion } from '@/weave/occasions/shape';

/**
 * The month, and the one alarm it raises.
 *
 * A calendar that cries wolf gets ignored, so what counts as a clash is
 * narrow on purpose and worth pinning down.
 */
const at = (over: Partial<Occasion> & { id: string }): Occasion => ({
  jobId: 'j', what: null, onDate: '2026-11-20', startsAt: '10:00:00', endsAt: '12:00:00',
  happenedAt: null, clientName: null, crew: [], ...over,
});

const who = (personId: string, name: string) => ({ id: `c-${personId}`, personId, name });

describe('being in two places at once', () => {
  it('catches one person on two overlapping occasions', () => {
    const clashes = clashesIn([
      at({ id: 'a', startsAt: '10:00:00', endsAt: '14:00:00', crew: [who('p1', 'Chidi')] }),
      at({ id: 'b', startsAt: '13:00:00', endsAt: '15:00:00', crew: [who('p1', 'Chidi')] }),
    ]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].who).toBe('Chidi');
  });

  /*
   * The false alarm that would make the whole thing useless. Two shoots at
   * once with different people is a studio having a good day.
   */
  it('says nothing when the overlap is different people', () => {
    expect(clashesIn([
      at({ id: 'a', crew: [who('p1', 'Chidi')] }),
      at({ id: 'b', crew: [who('p2', 'Ada')] }),
    ])).toHaveLength(0);
  });

  it('says nothing when nobody is assigned, because nothing has been claimed', () => {
    expect(clashesIn([at({ id: 'a' }), at({ id: 'b' })])).toHaveLength(0);
  });

  it('leaves touching times alone — one ends as the other starts', () => {
    expect(clashesIn([
      at({ id: 'a', startsAt: '10:00:00', endsAt: '12:00:00', crew: [who('p1', 'Chidi')] }),
      at({ id: 'b', startsAt: '12:00:00', endsAt: '14:00:00', crew: [who('p1', 'Chidi')] }),
    ])).toHaveLength(0);
  });

  it('treats a day with no time as the whole day', () => {
    expect(clashesIn([
      at({ id: 'a', startsAt: null, endsAt: null, crew: [who('p1', 'Chidi')] }),
      at({ id: 'b', startsAt: '09:00:00', endsAt: '10:00:00', crew: [who('p1', 'Chidi')] }),
    ])).toHaveLength(1);
  });

  it('does not reach across days', () => {
    expect(clashesIn([
      at({ id: 'a', onDate: '2026-11-20', crew: [who('p1', 'Chidi')] }),
      at({ id: 'b', onDate: '2026-11-21', crew: [who('p1', 'Chidi')] }),
    ])).toHaveLength(0);
  });
});

describe('how a clash is said', () => {
  it('says nothing at all when there is nothing wrong', () => {
    expect(sayClashes([])).toBeNull();
  });

  it('names the person rather than counting collisions', () => {
    expect(sayClashes([{ a: 'a', b: 'b', who: 'Chidi' }]))
      .toBe('Chidi is double-booked.');
  });

  it('names each of them once, however many collisions they are in', () => {
    expect(sayClashes([
      { a: 'a', b: 'b', who: 'Chidi' },
      { a: 'c', b: 'd', who: 'Chidi' },
      { a: 'e', b: 'f', who: 'Ada' },
    ])).toBe('Chidi and Ada are double-booked.');
  });
});

describe('the shape of a month', () => {
  it('starts on a Monday and runs in whole weeks', () => {
    const weeks = weeksOf(2026, 10); // November 2026
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(new Date(`${weeks[0][0]}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it('covers every day of the month it is asked for', () => {
    const weeks = weeksOf(2026, 10);
    const days = weeks.flat();
    expect(days).toContain('2026-11-01');
    expect(days).toContain('2026-11-30');
  });

  /* February 2027 starts on a Monday and is 28 days — exactly four weeks. */
  it('does not add a week a month never reaches into', () => {
    expect(weeksOf(2027, 1)).toHaveLength(4);
  });
});
