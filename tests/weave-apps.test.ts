import { describe, it, expect } from 'vitest';
import { APPS, sayApp, type AppKey, type Standing } from '@/app/apps';

/**
 * A tile is a reading, not a label beside a number.
 *
 * Two jobs: tell a studio with work on how much of it there is, and tell a
 * studio that signed up this morning what the screen is for. Never a gap,
 * and never a bare figure that needs a key to interpret.
 */
const nothing: Standing = {
  activeJobs: 0, onToday: 0, nextSevenDays: 0, requestsWaiting: 0,
  packages: { all: 0, published: 0 },
  team: 0,
  galleries: { all: 0, shared: 0 },
  ordersNeedingAttention: 0, picturesForSale: 0, messagesDue: 0,
};

const app = (key: AppKey) => APPS.find((a) => a.key === key)!;

describe('a studio with nothing in it', () => {
  it('says what every screen is for rather than reporting zero', () => {
    for (const a of APPS) expect(sayApp(a, nothing)).toBe(a.what);
  });

  it('leaves no tile without a sentence', () => {
    for (const a of APPS) expect(sayApp(a, nothing).trim()).not.toBe('');
  });
});

describe('a studio with work on', () => {
  it('counts active jobs', () => {
    expect(sayApp(app('board'), { ...nothing, activeJobs: 2 })).toBe('2 active jobs');
    expect(sayApp(app('board'), { ...nothing, activeJobs: 1 })).toBe('1 active job');
  });

  it('leads packages with what is published, because that is what can be booked', () => {
    expect(sayApp(app('packages'), { ...nothing, packages: { all: 4, published: 3 } }))
      .toBe('3 of 4 published');
  });

  it('says a package exists but cannot be booked yet', () => {
    expect(sayApp(app('packages'), { ...nothing, packages: { all: 1, published: 0 } }))
      .toBe('1 package, none published');
  });

  it('says a gallery exists but nobody can see it', () => {
    expect(sayApp(app('galleries'), { ...nothing, galleries: { all: 2, shared: 0 } }))
      .toBe('2 galleries, none shared');
  });

  it('counts people, not persons', () => {
    expect(sayApp(app('team'), { ...nothing, team: 1 })).toBe('1 person');
    expect(sayApp(app('team'), { ...nothing, team: 3 })).toBe('3 people');
  });

  it('names what a request is waiting for', () => {
    expect(sayApp(app('bookings'), { ...nothing, requestsWaiting: 1 }))
      .toBe('1 request awaiting a response');
  });

  it('counts shoots rather than occasions, which is not a word a studio uses', () => {
    expect(sayApp(app('mobile'), { ...nothing, onToday: 2 })).toBe('2 shoots today');
    expect(sayApp(app('calendar'), { ...nothing, nextSevenDays: 1 }))
      .toBe('1 shoot in the next seven days');
  });
});

describe('the list itself', () => {
  /* The lesson the scrapped system left: a missing tile looks exactly like a
   * complete grid, so the sidebar and the home page read one array. */
  it('gives every screen a key, a destination and a purpose', () => {
    for (const a of APPS) {
      expect(a.key).toBeTruthy();
      expect(a.href.startsWith('/')).toBe(true);
      expect(a.what.trim()).not.toBe('');
      expect(a.label.trim()).not.toBe('');
    }
  });

  it('points at no two screens with the same key', () => {
    expect(new Set(APPS.map((a) => a.key)).size).toBe(APPS.length);
  });
});
