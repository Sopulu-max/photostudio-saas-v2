import { describe, it, expect } from 'vitest';
import {
  daysSince, outstanding, sayNotHandedOver, sayNotSent,
  sayShortOfPromise, sayStanding, sayUnanswered, sayWaiting,
  type Dashboard,
} from '@/weave/dashboard/shape';

const empty: Dashboard = {
  unanswered: [], notHandedOver: [], shortOfPromise: [], notSent: [],
};

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
    sayUnanswered([]), sayUnanswered([asked('2026-11-20')]),
    sayNotHandedOver([]), sayShortOfPromise([]), sayNotSent([]),
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

describe('what is outstanding', () => {
  it('counts unanswered requests', () => {
    expect(sayUnanswered([asked('2026-11-20')])).toBe('1 unanswered request');
    expect(sayUnanswered([asked('2026-11-20'), asked('2026-11-24')]))
      .toBe('2 unanswered requests');
  });

  /*
   * Read off the gallery now rather than off a shoot somebody marked as
   * having happened: pictures sitting in an unshared gallery ARE the evidence
   * the work was done, and nobody has to remember to tick anything.
   */
  it('names galleries with pictures in them that nobody has been shown', () => {
    expect(sayNotHandedOver([{
      bookingId: 'j', clientName: 'Ada', galleryId: 'g', galleryName: "Ada's pictures", have: 40,
    }])).toBe('1 gallery not handed over');
  });

  it('totals how far short of the agreed count galleries are', () => {
    expect(sayShortOfPromise([
      { galleryId: 'g1', bookingId: 'j', name: "Ada's pictures", have: 10, promised: 40 },
      { galleryId: 'g2', bookingId: 'k', name: "Chidi's pictures", have: 8, promised: 10 },
    ])).toBe('2 galleries short by 32');
  });

  it('names orders paid for and still here', () => {
    expect(sayNotSent([{ id: 'o', clientName: 'Ada', paidAt: '2026-11-10' }]))
      .toBe('1 order not despatched');
  });

  it('adds up every section that is somebody else to act on', () => {
    expect(outstanding({
      ...empty,
      unanswered: [asked('2026-11-20')],
      notSent: [{ id: 'o', clientName: null, paidAt: '2026-11-10' }],
    })).toBe(2);
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
    expect(sayStanding(empty)).toBe('Nothing outstanding');
  });

  it('leads with what is outstanding', () => {
    expect(sayStanding({ ...empty, unanswered: [asked('2026-11-20')] }))
      .toBe('1 item outstanding');
  });
});
