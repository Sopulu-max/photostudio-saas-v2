import { describe, it, expect } from 'vitest';
import { sayLeaving, sayTeam, worksHere, type TeamMember } from '@/weave/team/shape';

/**
 * Who works here.
 *
 * Employment is the only relationship in this system that is recorded rather
 * than derived from an edge, so what counts as working here is worth pinning.
 */
const member = (over: Partial<TeamMember> & { id: string; name: string }): TeamMember => ({
  email: null, phone: null, joinedAt: '2026-01-01T00:00:00Z', leftAt: null,
  hasAccount: false, booked: 0, ...over,
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
  it('does not make a studio of one sound like a failure', () => {
    expect(sayTeam([member({ id: 'a', name: 'You' })])).toBe('Just you.');
  });

  it('says nothing is there when nothing is', () => {
    expect(sayTeam([])).toBe('Nobody is on the team yet.');
  });

  it('counts only the ones still here, and mentions the ones who left', () => {
    expect(sayTeam([
      member({ id: 'a', name: 'You' }),
      member({ id: 'b', name: 'Emeka' }),
      member({ id: 'c', name: 'Old', leftAt: '2026-06-01T00:00:00Z' }),
    ])).toBe('2 people work here, and 1 has left.');
  });

  /* Someone who has left is not counted among the people who work here. */
  it('reads a sole remaining member as one, not three', () => {
    expect(sayTeam([
      member({ id: 'a', name: 'You' }),
      member({ id: 'b', name: 'Gone', leftAt: '2026-06-01T00:00:00Z' }),
      member({ id: 'c', name: 'Also gone', leftAt: '2026-07-01T00:00:00Z' }),
    ])).toBe('Just you, and 2 who have left.');
  });
});

describe('letting somebody go', () => {
  it('says nothing when they are carrying nothing', () => {
    expect(sayLeaving(member({ id: 'a', name: 'Emeka' }))).toBeNull();
  });

  /*
   * Not a block. A studio knows its own business — but nobody should find
   * out afterwards that the person who left was on next week's wedding.
   */
  it('warns about the shoots they are already on', () => {
    expect(sayLeaving(member({ id: 'a', name: 'Emeka', booked: 1 })))
      .toBe('Emeka is on 1 shoot ahead.');
    expect(sayLeaving(member({ id: 'a', name: 'Emeka', booked: 3 })))
      .toBe('Emeka is on 3 shoots ahead.');
  });
});
