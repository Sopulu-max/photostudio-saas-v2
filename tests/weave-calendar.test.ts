import { describe, it, expect } from 'vitest';
import {
  daysOf, isView, rangeOf, saySpan, step, titleOf, weeksOf, type Entry,
} from '@/weave/calendar/shape';

/**
 * Three ways of looking at one set of dates.
 *
 * Every view asks for a range and draws what comes back, so what is worth
 * pinning is the ranges: a line that appears in the week and is missing from
 * the month would be this arithmetic, not the data.
 */
const entry = (over: Partial<Entry> = {}): Entry => ({
  kind: 'shoot', on: '2026-12-13', at: null, what: 'Wedding',
  who: 'Adaeze Okafor', crew: [], href: '/bookings/x', ...over,
});

describe('which view', () => {
  it('takes only the three it has', () => {
    expect(isView('month')).toBe(true);
    expect(isView('week')).toBe(true);
    expect(isView('day')).toBe(true);
  });

  /* It arrives in a URL anybody can type. */
  it('refuses anything else', () => {
    expect(isView('year')).toBe(false);
    expect(isView(undefined)).toBe(false);
    expect(isView('')).toBe(false);
  });
});

describe('what a view asks for', () => {
  it('gives a day exactly its own day', () => {
    expect(rangeOf('day', '2026-12-13')).toEqual({ from: '2026-12-13', to: '2026-12-13' });
  });

  /* Weeks start on Monday, and a Sunday belongs to the week behind it. */
  it('runs a week Monday to Sunday', () => {
    expect(rangeOf('week', '2026-12-13')).toEqual({ from: '2026-12-07', to: '2026-12-13' });
    expect(rangeOf('week', '2026-12-07')).toEqual({ from: '2026-12-07', to: '2026-12-13' });
  });

  /*
   * A month reaches past its own edges: the grid shows the tail of the month
   * before and the head of the next, and a range stopping at the first would
   * leave work missing from cells that are on the screen.
   */
  it('reaches past a month to the edges of its grid', () => {
    const { from, to } = rangeOf('month', '2026-12-13');
    expect(from <= '2026-12-01').toBe(true);
    expect(to >= '2026-12-31').toBe(true);
  });
});

describe('stepping', () => {
  it('moves by the unit the view is in', () => {
    expect(step('day', '2026-12-13', 1)).toBe('2026-12-14');
    expect(step('week', '2026-12-13', 1)).toBe('2026-12-20');
    expect(step('month', '2026-12-13', 1)).toBe('2027-01-01');
  });

  it('goes back as well as forward', () => {
    expect(step('day', '2027-01-01', -1)).toBe('2026-12-31');
    expect(step('month', '2027-01-15', -1)).toBe('2026-12-01');
  });
});

describe('what a span is called', () => {
  it('names a month and a day plainly', () => {
    expect(titleOf('month', '2026-12-13')).toBe('December 2026');
    expect(titleOf('day', '2026-12-13')).toBe('Sunday, 13 December 2026');
  });

  /* "Week 50" is a number nobody thinks in. */
  it('says a week as the days it runs between', () => {
    expect(titleOf('week', '2026-12-13')).toBe('7 – 13 December 2026');
  });

  it('names both months when a week straddles them', () => {
    expect(titleOf('week', '2026-12-01')).toBe('30 November – 6 December 2026');
  });
});

describe('what a span holds', () => {
  /*
   * It does not name the span. The title says which month or day this is
   * directly above, and repeating it read "1 shoot in Sunday, 13 December".
   */
  it('states the absence', () => {
    expect(saySpan([])).toBe('Nothing on.');
  });

  it('leads with the shoots, because they are the work', () => {
    expect(saySpan([entry()])).toBe('1 shoot.');
    expect(saySpan([entry(), entry()])).toBe('2 shoots.');
  });

  it('counts what the work owes apart from the work', () => {
    expect(saySpan([entry(), entry({ kind: 'closes' })]))
      .toBe('1 shoot, 1 other thing due.');
  });

  it('says so when nothing is a shoot', () => {
    expect(saySpan([entry({ kind: 'code' }), entry({ kind: 'follow-up' })]))
      .toBe('2 things due, no shoots.');
  });
});

describe('the days a span covers', () => {
  it('runs inclusive of both ends', () => {
    expect(daysOf('2026-12-07', '2026-12-13')).toHaveLength(7);
    expect(daysOf('2026-12-13', '2026-12-13')).toEqual(['2026-12-13']);
  });

  it('pads a month into whole weeks of seven', () => {
    for (const week of weeksOf(2026, 11)) expect(week).toHaveLength(7);
  });
});
