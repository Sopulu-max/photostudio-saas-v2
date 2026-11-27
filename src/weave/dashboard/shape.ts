import type { GalleryHubRequestSummary } from '@/weave/galleries/shape';

/** The dashboard reads scheduled work and outstanding commitments. */

export type UnansweredRequest = {
  id: string;
  clientName: string | null;
  wants: string | null;
  requestedAt: string;
};

/** A gallery with files in it that has yet to be shared. */
export type NotHandedOver = {
  bookingId: string | null;
  clientName: string | null;
  galleryId: string;
  galleryName: string;
  /** How many pictures are sitting in it, unseen. */
  have: number;
};

export type ShortOfPromise = {
  galleryId: string;
  bookingId: string | null;
  name: string;
  have: number;
  promised: number;
};

export type NotSent = {
  id: string;
  clientName: string | null;
  paidAt: string;
};

export type Dashboard = {
  unanswered: UnansweredRequest[];
  unscheduled: DashboardBooking[];
  notHandedOver: NotHandedOver[];
  shortOfPromise: ShortOfPromise[];
  notSent: NotSent[];
};

export type DashboardBooking = {
  id: string;
  occasion: string | null;
  clientName: string | null;
};

export type ScheduledShoot = DashboardBooking & {
  on: string;
  at: string | null;
  crew: string[];
  needsCrew: boolean;
};

export type DeadlineGallery = {
  id: string;
  bookingId: string | null;
  name: string;
};

export type GalleryDeadline = {
  id: string;
  on: string;
  title: string;
  gallery: DeadlineGallery;
} & (
  | { kind: 'selection' }
  | { kind: 'hub'; purpose: GalleryHubRequestSummary['purpose'] }
  | { kind: 'expiry' }
);

export function staffingGaps(shoots: ScheduledShoot[]): ScheduledShoot[] {
  return shoots.filter((shoot) => shoot.needsCrew);
}

/** An inclusive seven-day window starting on the given calendar day. */
export function scheduleThrough(today: string): string {
  const last = new Date(`${today}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + 6);
  return last.toISOString().slice(0, 10);
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Whole days between two dates, by calendar day rather than by hours. */
export function daysSince(iso: string, today: Date): number {
  const then = new Date(iso);
  const a = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * How long something has been outstanding, as a duration.
 *
 * A figure, not a narration. "Since Tuesday" is useless by the following
 * week and "4320 minutes" is useless always.
 */
export function sayWaiting(iso: string, today: Date): string {
  const days = daysSince(iso, today);
  if (days === 0) return 'Today';
  return count(days, 'day', 'days');
}

/*
 * TERSE. No full stops, no second clause, no connective tissue.
 *
 * A sentence with a full stop is prose, and six of them stacked up is a
 * report ABOUT the studio rather than the studio itself. An app states a
 * thing and gets out of the way; the detail belongs on the rows underneath,
 * where it sits beside the row it is true of.
 */
export function sayUnanswered(rows: UnansweredRequest[]): string {
  if (rows.length === 0) return 'No unanswered requests';
  return `${count(rows.length, 'unanswered request', 'unanswered requests')}`;
}

export function sayNotHandedOver(rows: NotHandedOver[]): string {
  if (rows.length === 0) return 'No galleries awaiting sharing';
  return `${count(rows.length, 'gallery', 'galleries')} not handed over`;
}

export function sayShortOfPromise(rows: ShortOfPromise[]): string {
  if (rows.length === 0) return 'No incomplete shared galleries';
  const owed = rows.reduce((n, r) => n + (r.promised - r.have), 0);
  return `${count(rows.length, 'gallery', 'galleries')} short by ${count(owed, 'file', 'files')}`;
}

export function sayNotSent(rows: NotSent[]): string {
  if (rows.length === 0) return 'No paid orders awaiting fulfilment';
  return `${count(rows.length, 'paid order', 'paid orders')} awaiting fulfilment`;
}

/** How many things are somebody's move. */
export function outstanding(d: Dashboard, unstaffed: number): number {
  return d.unanswered.length + d.unscheduled.length + d.notHandedOver.length
    + d.shortOfPromise.length + d.notSent.length + unstaffed;
}

/**
 * The line under the title.
 *
 * A figure and a noun. No exhortation, and nothing addressed to whoever is
 * reading it.
 */
export function sayStanding(d: Dashboard, unstaffed: number | null): string {
  if (unstaffed === null) return 'Outstanding total unavailable';
  const n = outstanding(d, unstaffed);
  return n === 0 ? 'Nothing outstanding' : `${count(n, 'item', 'items')} outstanding`;
}
