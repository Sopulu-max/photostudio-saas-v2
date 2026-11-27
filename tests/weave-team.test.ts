import { describe, it, expect } from 'vitest';
import {
  sayDone, sayLeaving, sayLoad, sayTeam, worksHere, type TeamMember,
} from '@/weave/team/shape';

/**
 * Who works here.
 *
 * Employment is the only relationship in this system that is recorded rather
 * than derived from an edge, so what counts as working here is worth pinning.
 */
const member = (over: Partial<TeamMember> & { id: string; name: string }): TeamMember => ({
  email: null, phone: null, joinedAt: '2026-01-01T00:00:00Z', leftAt: null,
  role: null, avatarPath: null, booked: 0, ...over,
});

describe('working here', () => {
  it('is joined and not gone', () => {
    expect(worksHere(member({ id: 'a', name: 'Emeka' }))).toBe(true);
  });

  it('ends when they leave, and the row stays', () => {
    const gone = member({ id: 'a', name: 'Emeka', leftAt: '2026-06-01T00:00:00Z' });
    expect(worksHere(gone)).toBe(false);
    expect(gone.name).toBe('Emeka');
  });
});

describe('how a team says itself', () => {
  it('states the count plainly', () => {
    expect(sayTeam([member({ id: 'a', name: 'You' })])).toBe('1 member.');
  });

  it('says nothing is there when nothing is', () => {
    expect(sayTeam([])).toBe('No team members.');
  });

  it('counts only the ones still here, and mentions the ones who left', () => {
    expect(sayTeam([
      member({ id: 'a', name: 'You' }),
      member({ id: 'b', name: 'Emeka' }),
      member({ id: 'c', name: 'Old', leftAt: '2026-06-01T00:00:00Z' }),
    ])).toBe('2 members, 1 former.');
  });

  /* Someone who has left is not counted among the people who work here. */
  it('reads a sole remaining member as one, not three', () => {
    expect(sayTeam([
      member({ id: 'a', name: 'You' }),
      member({ id: 'b', name: 'Gone', leftAt: '2026-06-01T00:00:00Z' }),
      member({ id: 'c', name: 'Also gone', leftAt: '2026-07-01T00:00:00Z' }),
    ])).toBe('1 member, 2 former.');
  });
});

describe('letting somebody go', () => {
  /*
   * Not a block. A studio knows its own business — but nobody should discover
   * afterwards that the person who left was on next week's wedding.
   */
  it('says nothing when they are carrying nothing', () => {
    expect(sayLeaving(member({ id: 'a', name: 'Emeka' }))).toBeNull();
  });

  it('names the bookings they have not finished', () => {
    expect(sayLeaving(member({ id: 'a', name: 'Emeka', booked: 1 })))
      .toBe('Emeka is on 1 unfinished booking.');
    expect(sayLeaving(member({ id: 'a', name: 'Emeka', booked: 3 })))
      .toBe('Emeka is on 3 unfinished bookings.');
  });
});

describe('what somebody is carrying', () => {
  /* A blank where a count belongs reads as a broken row. */
  it('states the absence rather than leaving a gap', () => {
    expect(sayLoad(member({ id: 'a', name: 'Emeka' }))).toBe('No bookings');
  });

  it('counts one booking as a booking', () => {
    expect(sayLoad(member({ id: 'a', name: 'Emeka', booked: 1 }))).toBe('On 1 booking');
    expect(sayLoad(member({ id: 'a', name: 'Emeka', booked: 4 }))).toBe('On 4 bookings');
  });

  /*
   * The heading on their page counts what is NOT behind them, and the list
   * under it shows exactly that. A count that disagrees with the rows beneath
   * it is worse than no count, which is what this pair of readings is for.
   */
  it('says nothing about earlier work when there is none', () => {
    expect(sayDone(0)).toBeNull();
  });

  it('counts earlier bookings apart from the ones still to come', () => {
    expect(sayDone(1)).toBe('1 earlier booking');
    expect(sayDone(5)).toBe('5 earlier bookings');
  });
});
