import { listRecentActivity } from '@/kernel/events';
import { readBookingsSheet, type BookingsSheet, type SheetBooking, type Period } from './sheet';

/**
 * THE BOOKINGS DASHBOARD - the day's questions about bookings, each
 * answered with the bookings themselves, decided here so the page draws.
 *
 *   What needs me?      - attention: enquiries with no decision, bookings
 *                         with no date, this week's sessions with a step
 *                         nobody is on, dates passed and still open.
 *   What is next?       - upNext: the sessions ahead, soonest first.
 *   Where is everything? - pipeline: each stage, how many, who is next
 *                         and who has waited longest in it.
 *   What just changed?  - recent: the last events on bookings, named.
 *   How are we doing?   - the sheet's figures and series (sheet.ts).
 *
 * Every widget is a reading of the same rows the day book shows, so it
 * cannot disagree with it, and every widget is a door: it says how to
 * narrow the day book to exactly its question. The conditions are the
 * ontology's - no date, nobody on a step, past its date, no decision on an
 * enquiry; the values are the studio's - its stages, its people.
 */

export type NextRow = {
  booking: SheetBooking;
  /** The first unfinished step and who is on it, across the booking's services - null when there is no work. */
  position: { service: string; step: string; who: string | null } | null;
};

export type Attention = {
  key: 'enquiries' | 'undated' | 'unstaffed' | 'overdue';
  label: string;
  count: number;
  /** One more thing worth saying - the longest wait, the soonest date. */
  note: string | null;
  /** The first few, for the eye. */
  sample: SheetBooking[];
  /** How to open the day book on exactly these - null when a single select cannot say it. */
  narrow: Record<string, string> | null;
};

export type PipelineStage = {
  key: string;
  label: string;
  look: { kind: string | null; color: string | null } | null;
  count: number;
  /** The soonest dated booking in the stage. */
  next: SheetBooking | null;
  /** The booking that has been in the book longest, and for how many days. */
  oldest: { booking: SheetBooking; days: number } | null;
};

export type RecentRow = { id: string; at: string; who: string; phrase: string; booking: { id: string; title: string } | null };

export type BookingsDashboard = {
  sheet: BookingsSheet;
  attention: Attention[];
  upNext: NextRow[];
  pipeline: PipelineStage[];
  recent: RecentRow[];
};

const daysBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000));

export async function readBookingsDashboard(period: Period = 30): Promise<BookingsDashboard> {
  const [sheet, events] = await Promise.all([readBookingsSheet(period), listRecentActivity(8, 'booking')]);
  const rows = sheet.bands.flatMap((b) => b.rows);
  const live = rows.filter((r) => r.band !== 'closed');
  const { today } = sheet;
  const madeOn = (r: SheetBooking) => r.createdAt.slice(0, 10);
  const byCreated = (a: SheetBooking, b: SheetBooking) => a.createdAt.localeCompare(b.createdAt);
  const bySoon = (a: SheetBooking, b: SheetBooking) => (a.scheduledFor ?? '￿').localeCompare(b.scheduledFor ?? '￿');

  // ---- What needs me.
  const enquiries = live.filter((r) => !r.stage || r.stage.kind === 'enquiry').sort(byCreated);
  const enquiryStages = [...new Set(enquiries.map((r) => r.stage?.id).filter(Boolean))] as string[];
  const undated = live.filter((r) => r.band === 'undated').sort(byCreated);
  const unstaffed = live.filter((r) => ['today', 'tomorrow', 'week'].includes(r.band) && (r.work?.unstaffed ?? 0) > 0).sort(bySoon);
  const overdue = live.filter((r) => r.band === 'earlier').sort(bySoon);
  const oldestWait = (rs: SheetBooking[]) => (rs[0] ? daysBetween(madeOn(rs[0]), today) : 0);
  const attention: Attention[] = [
    { key: 'enquiries', label: 'enquiries waiting for a decision', count: enquiries.length,
      note: enquiries.length > 0 ? `longest ${oldestWait(enquiries)} day${oldestWait(enquiries) === 1 ? '' : 's'}` : null,
      sample: enquiries.slice(0, 3), narrow: enquiryStages.length === 1 ? { stage: enquiryStages[0] } : null },
    { key: 'undated', label: 'with no date yet', count: undated.length,
      note: undated.length > 0 ? `longest ${oldestWait(undated)} day${oldestWait(undated) === 1 ? '' : 's'}` : null,
      sample: undated.slice(0, 3), narrow: { when: 'undated' } },
    { key: 'unstaffed', label: 'this week with a step nobody is on', count: unstaffed.length,
      note: unstaffed[0]?.scheduledFor ? `first ${new Date(unstaffed[0].scheduledFor).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : null,
      sample: unstaffed.slice(0, 3), narrow: null },
    { key: 'overdue', label: 'past their date, still open', count: overdue.length,
      note: overdue[0]?.day ? `oldest ${daysBetween(overdue[0].day, today)} day${daysBetween(overdue[0].day, today) === 1 ? '' : 's'} ago` : null,
      sample: overdue.slice(0, 3), narrow: { when: 'earlier' } },
  ];

  // ---- What is next: the week's sessions; if the week is empty, what comes after it.
  const ahead = live.filter((r) => ['today', 'tomorrow', 'week'].includes(r.band)).sort(bySoon);
  const later = live.filter((r) => r.band === 'later').sort(bySoon);
  const upNext: NextRow[] = (ahead.length > 0 ? ahead : later).slice(0, 8).map((booking) => {
    const open = booking.work?.positions.find((p) => !p.done);
    return { booking, position: open && open.step ? { service: open.service, step: open.step, who: open.who } : null };
  });

  // ---- Where everything is: the studio's stages, each with who is next and who has waited longest.
  const pipeline: PipelineStage[] = sheet.byStage.map((st) => {
    const inStage = rows.filter((r) => (r.stage?.id ?? '') === st.key);
    const dated = inStage.filter((r) => r.scheduledFor && r.day !== null && r.day >= today).sort(bySoon);
    const oldest = [...inStage].sort(byCreated)[0];
    return {
      key: st.key, label: st.label, look: st.look, count: st.count,
      next: dated[0] ?? null,
      oldest: oldest ? { booking: oldest, days: daysBetween(madeOn(oldest), today) } : null,
    };
  });

  // ---- What just changed, with the booking named where it still exists.
  const titleOf = new Map(rows.map((r) => [r.id, r.title] as const));
  const recent: RecentRow[] = events.map((e) => ({
    id: e.id, at: e.at, who: e.who, phrase: e.phrase,
    booking: titleOf.has(e.entityId) ? { id: e.entityId, title: titleOf.get(e.entityId)! } : null,
  }));

  return { sheet, attention, upNext, pipeline, recent };
}
