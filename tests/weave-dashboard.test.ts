import { describe, it, expect } from 'vitest';
import {
  daysSince, outstanding, sayNotHandedOver, sayNotInTheDiary, sayNotSent,
  sayShortOfPromise, sayStanding, sayStart, sayToday, sayUnanswered, sayWaiting,
  type Dashboard,
} from '@/weave/dashboard/shape';

const empty: Dashboard = {
  today: [], unanswered: [], notInTheDiary: [],
  notHandedOver: [], shortOfPromise: [], notSent: [],
};

const shoot = (crew: string[] = []) => ({
  id: 'o', jobId: 'j', what: 'The ceremony', clientName: 'Ada',
  startsAt: null, endsAt: null, crew,
});

const asked = (requestedAt: string) => ({
  id: 'r', clientName: 'Ada', wants: 'Headshots', requestedAt,
});

const NOW = new Date('2026-11-25T09:00:00Z');

describe('the words on the dashboard', () => {
  /*
   * The rule broken most often here. Labels are nouns, actions are verbs,
   * and nothing on screen addresses whoever is reading it. These hold the
   * line rather than trusting anybody to remember it.
   */
  const everySentence = [
    sayToday([]), sayToday([shoot(), shoot(['Chidi'])]),
    sayUnanswered([]), sayUnanswered([asked('2026-11-20')]),
    sayNotInTheDiary([]), sayNotHandedOver([]), sayShortOfPromise([]), sayNotSent([]),
    sayStanding(empty),
  ];

  it('never addresses the reader', () => {
    for (const said of everySentence) {
      expect(said).not.toMatch(/\byou\b|\byour\b|\bme\b|\bmy\b|\bwe\b|\bour\b/i);
    }
  });

  it('never asks a question', () => {
    for (const said of everySentence) expect(said).not.toContain('?');
  });

  /* A full stop makes it prose. A reading is a statement, not a sentence. */
  it('states rather than narrates', () => {
    for (const said of everySentence) expect(said.endsWith('.')).toBe(false);
  });
});

describe('today', () => {
  it('states the absence rather than leaving a gap', () => {
    expect(sayToday([])).toBe('No shoots today');
  });

  it('says nothing about crew when everything is staffed', () => {
    expect(sayToday([shoot(['Chidi'])])).toBe('1 shoot today');
  });

  it('counts the shoots nobody is on', () => {
    expect(sayToday([shoot(), shoot(['Chidi'])])).toBe('2 shoots today, 1 without crew');
  });

  it('counts them all when nobody is on any of them', () => {
    expect(sayToday([shoot(), shoot()])).toBe('2 shoots today, 2 without crew');
  });
});

describe('what is outstanding', () => {
  it('counts unanswered requests', () => {
    expect(sayUnanswered([asked('2026-11-20')])).toBe('1 unanswered request');
    expect(sayUnanswered([asked('2026-11-20'), asked('2026-11-24')]))
      .toBe('2 unanswered requests');
  });

  it('names agreed work with no shoot in the diary', () => {
    expect(sayNotInTheDiary([{ id: 'j', clientName: 'Ada', wants: null, acceptedAt: '2026-11-01' }]))
      .toBe('1 job without a shoot');
  });

  it('names work shot and not delivered', () => {
    expect(sayNotHandedOver([{
      jobId: 'j', clientName: 'Ada', galleryId: null, galleryName: null, happenedAt: '2026-11-02',
    }])).toBe('1 shoot undelivered');
  });

  it('totals how far short of the agreed count galleries are', () => {
    expect(sayShortOfPromise([
      { galleryId: 'g1', jobId: 'j', name: "Ada's pictures", have: 10, promised: 40 },
      { galleryId: 'g2', jobId: 'k', name: "Chidi's pictures", have: 8, promised: 10 },
    ])).toBe('2 galleries short by 32');
  });

  it('names orders paid for and still here', () => {
    expect(sayNotSent([{ id: 'o', clientName: 'Ada', paidAt: '2026-11-10' }]))
      .toBe('1 order not despatched');
  });

  it('does not count today as a backlog', () => {
    expect(outstanding({ ...empty, today: [shoot(), shoot()] })).toBe(0);
  });

  it('adds up every section that is somebody else to act on', () => {
    expect(outstanding({
      ...empty,
      unanswered: [asked('2026-11-20')],
      notSent: [{ id: 'o', clientName: null, paidAt: '2026-11-10' }],
    })).toBe(2);
  });
});

describe('when a shoot starts', () => {
  /*
   * `occasions.starts_at` is a bare clock time. Passed to new Date() it
   * produced "Invalid Date" on the dashboard, which shipped unlooked-at.
   */
  it('reads a bare clock time rather than parsing it as a date', () => {
    expect(sayStart('14:00:00', null)).toBe('14:00');
  });

  it('gives the range when the end is known', () => {
    expect(sayStart('14:00:00', '16:30:00')).toBe('14:00–16:30');
  });

  it('states the absence rather than leaving a gap', () => {
    expect(sayStart(null, null)).toBe('No time set');
    expect(sayStart(null, '16:00:00')).toBe('No time set');
  });
});

describe('how long something has been waiting', () => {
  it('counts whole days, not hours', () => {
    expect(daysSince('2026-11-20T23:00:00Z', NOW)).toBe(5);
    expect(daysSince('2026-11-25T01:00:00Z', NOW)).toBe(0);
  });

  it('never reads as a negative age when a date is ahead', () => {
    expect(daysSince('2026-12-01T00:00:00Z', NOW)).toBe(0);
  });

  it('gives a duration rather than a day name', () => {
    expect(sayWaiting('2026-11-25T01:00:00Z', NOW)).toBe('Today');
    expect(sayWaiting('2026-11-24T01:00:00Z', NOW)).toBe('1 day');
    expect(sayWaiting('2026-11-18T01:00:00Z', NOW)).toBe('7 days');
  });
});

describe('the line under the title', () => {
  it('reports a clear board without a zero', () => {
    expect(sayStanding(empty)).toBe('Nothing outstanding, no shoots today');
  });

  it('leads with what is outstanding', () => {
    expect(sayStanding({ ...empty, unanswered: [asked('2026-11-20')], today: [shoot(['Chidi'])] }))
      .toBe('1 item outstanding, 1 shoot today');
  });
});
