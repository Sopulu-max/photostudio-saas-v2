'use server';

import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listRecentActivity } from '@/kernel/events';
import { readBookingsSheet } from '@/modules/bookings/interface';
import { readTasksSheet } from '@/modules/production/interface';
import { getAttendanceToday } from '@/modules/team/interface';
import { listGalleries } from '@/modules/delivery/interface';
import { listInvoices, settlementOf } from '@/modules/finances/interface';
import { listContracts } from '@/modules/contracts/interface';
import { listNoteRemindersInRange } from '@/modules/notes/interface';

/**
 * THE STUDIO, READ ACROSS ITS PARTS.
 *
 * The Command Center used to be the bookings page under another name: every
 * section on it - what needs attention, this week, open bookings, recent
 * activity - was bookings, and it competed with the bookings page while
 * answering worse. A studio is not its bookings. It is people who come in or
 * do not, work that is done or waiting, things owed to clients and things owed
 * by them, papers awaiting a signature, and galleries sitting unsent.
 *
 * SO THE SECTIONS ARE THE STUDIO'S OWN PARTS, one reading each, and each one
 * says what that part is BLOCKED on rather than how much of it exists. A count
 * of galleries informs nobody; galleries finished and never sent is a morning's
 * work. The same for every part: the number is chosen because somebody has to
 * act on it.
 *
 * NOTHING IS STORED AND NOTHING IS RE-DERIVED. Every figure comes from the
 * module that owns the fact, through its public interface - the bookings sheet
 * for the book, the tasks sheet for the work, Team for who is in, Finances for
 * what is owed. This module composes; it does not decide. That is also why it
 * asks in one wave: none of these answers depends on another.
 *
 * WHAT IS ABSENT IS STATED. A part with nothing blocked says so, because "no
 * galleries waiting" is a fact an operator needs and a blank space is not.
 */

export type StudioPart = {
  /** The app's own name for this part of the studio, matching its nav item. */
  key: string;
  name: string;
  /** Where it stands: the figure somebody acts on, with the noun it counts. */
  said: string;
  /** Nothing to act on. Said, not hidden. */
  settled: boolean;
  /** Where to go to act on it. */
  href: string;
  /** The particulars, at most a handful - each already a statement. */
  lines: { id: string; said: string; note: string | null; href: string }[];
};

export type StudioToday = {
  day: string;
  /** The studio's own hours for today, and why today differs if it does. */
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
  openingLabel: string | null;
  /** Who is in, who is expected, who is not working today - Team's own reading. */
  present: number;
  expected: number;
  off: number;
  late: number;
  /** Sessions the studio holds today, by the studio's clock. */
  sessions: { id: string; said: string; href: string }[];
};

export type StudioOverview = {
  today: StudioToday;
  parts: StudioPart[];
  activity: { id: string; said: string; at: string }[];
};

/*
 * Only ever called on the app's OWN regular nouns - booking, task, contract,
 * invoice, reminder, file. It said "0 gallerys" the first time it met an
 * irregular one, so anything irregular is phrased with a verb instead and the
 * noun stays in the section's heading. A studio's own words are never passed
 * through here at all: inflecting those is forbidden (tests/studio-words).
 */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function readStudioOverview(): Promise<StudioOverview> {
  await getAuthOrgId();

  const [book, work, attendance, galleries, invoices, contracts, reminders, events] = await Promise.all([
    readBookingsSheet(30),
    readTasksSheet(),
    getAttendanceToday(),
    listGalleries(),
    listInvoices(),
    listContracts(),
    // Reminders already due: a dated obligation nobody has cleared.
    listNoteRemindersInRange('1970-01-01', new Date().toISOString()),
    listRecentActivity(8),
  ]);

  const rows = book.bands.flatMap((b) => b.rows);
  const live = rows.filter((r) => r.band !== 'closed');

  /* ---------------------------------------------------------------- today */
  const roster = attendance.roster;
  const todaysSessions = (book.bands.find((b) => b.key === 'today')?.rows ?? []);
  const today: StudioToday = {
    day: attendance.workDate,
    opensAt: attendance.opensAt,
    closesAt: attendance.closesAt,
    closed: attendance.closed,
    openingLabel: attendance.openingLabel,
    present: roster.filter((r) => r.state === 'in').length,
    expected: roster.filter((r) => r.state === 'away').length,
    off: roster.filter((r) => r.state === 'off').length,
    late: roster.filter((r) => r.lateBy !== null).length,
    sessions: todaysSessions.map((r) => ({
      id: r.id,
      said: r.clientName ?? r.title,
      href: `/bookings/${r.id}`,
    })),
  };

  /* ----------------------------------------------------------- the parts */

  // BOOKINGS: what has arrived and not been resolved. A booking with no date
  // cannot be worked and a decision nobody has made is the studio's to make.
  const undated = live.filter((r) => r.day === null);
  const awaitingStudio = live.filter((r) => r.planes.intake.agreement === 'none' && r.planes.intake.package);
  const bookingLines = [...undated, ...awaitingStudio]
    .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
    .slice(0, 4)
    .map((r) => ({
      id: r.id,
      said: r.clientName ?? r.title,
      note: r.day === null ? 'no session date' : 'no agreement yet',
      href: `/bookings/${r.id}`,
    }));

  // WORK: a step nobody is on cannot happen. The roles it needs are the
  // studio's own, so they are named as the studio named them.
  const openTasks = work.rows.filter((t) => !t.done);
  const unassigned = openTasks.filter((t) => !t.assignee);
  const shortRoles = [...new Map(unassigned.filter((t) => t.role).map((t) => [t.role!.id, t.role!.name])).entries()];

  // CONTRACTS: a paper sent and not signed is waiting on somebody else.
  const proposed = (contracts as any[]).filter((c) => c.status === 'proposed' || c.status === 'modified');

  // GALLERIES: finished and never sent is the one that costs a client.
  const unsent = galleries.filter((g) => !g.sharedAt);

  // MONEY: what is owed on what was actually issued, by Finances' own rule.
  const owing = (invoices as any[])
    .filter((i) => i.status !== 'void' && i.status !== 'draft')
    .map((i) => ({ invoice: i, owed: settlementOf(i.total, i.payments || []).outstanding }))
    .filter((x) => x.owed > 0);
  const owed = owing.reduce((n, x) => n + x.owed, 0);

  const parts: StudioPart[] = [
    {
      key: 'bookings', name: 'Bookings', href: '/bookings',
      settled: undated.length === 0 && awaitingStudio.length === 0,
      said: undated.length === 0 && awaitingStudio.length === 0
        ? `${plural(live.length, 'booking')} on the book, all dated and agreed`
        : [
            // The heading already says Bookings; repeating it in every clause
            // told the reader nothing twice.
            undated.length > 0 ? `${undated.length} with no session date` : null,
            awaitingStudio.length > 0 ? `${awaitingStudio.length} with no agreement` : null,
          ].filter(Boolean).join(', '),
      lines: bookingLines,
    },
    {
      key: 'tasks', name: 'Tasks', href: '/tasks',
      settled: unassigned.length === 0,
      said: unassigned.length === 0
        ? `${plural(openTasks.length, 'task')} open, every one assigned`
        : `${plural(unassigned.length, 'task')} nobody is on, of ${plural(openTasks.length, 'task')} open`,
      lines: shortRoles.slice(0, 4).map(([id, name]) => ({
        id,
        said: name,
        note: `${unassigned.filter((t) => t.role?.id === id).length} waiting`,
        href: `/tasks?role=${encodeURIComponent(id)}`,
      })),
    },
    {
      key: 'contracts', name: 'Contracts', href: '/contracts',
      settled: proposed.length === 0,
      said: proposed.length === 0
        ? 'no contract is waiting on a signature'
        : `${plural(proposed.length, 'contract')} awaiting a signature`,
      lines: proposed.slice(0, 4).map((c) => ({
        id: c.id as string,
        said: (c.person?.display_name ?? c.booking?.title ?? 'Contract') as string,
        note: c.status as string,
        href: `/contracts/${c.id}`,
      })),
    },
    {
      key: 'galleries', name: 'Galleries', href: '/galleries',
      settled: unsent.length === 0,
      said: unsent.length > 0
        ? `${unsent.length} finished and not sent`
        : galleries.length === 0
          ? 'none made yet'
          : 'every one has been sent',
      lines: unsent.slice(0, 4).map((g) => ({
        id: g.id,
        said: g.clientName ?? g.title,
        note: g.fileCount > 0 ? plural(g.fileCount, 'file') : 'no files yet',
        href: `/galleries/${g.id}`,
      })),
    },
    {
      key: 'finances', name: 'Finances', href: '/finances',
      settled: owing.length === 0,
      said: owing.length === 0
        ? 'nothing is owed on an issued invoice'
        : `${plural(owing.length, 'invoice')} still owed`,
      lines: owing.slice(0, 4).map((x) => ({
        id: x.invoice.id as string,
        said: (x.invoice.number ?? 'Invoice') as string,
        note: null,
        href: `/finances/invoices/${x.invoice.id}`,
      })),
    },
    {
      key: 'notes', name: 'Notes', href: '/notes',
      settled: reminders.length === 0,
      said: reminders.length === 0
        ? 'no reminder is due'
        : `${plural(reminders.length, 'reminder')} due`,
      lines: reminders.slice(0, 4).map((r: any) => ({
        id: r.id as string,
        said: (r.title ?? 'Reminder') as string,
        note: null,
        href: '/notes',
      })),
    },
  ];

  return {
    today,
    parts,
    /*
     * listRecentActivity already composes the sentence - "info drafted a
     * contract" - from the event's entity and action, so this passes it
     * through. Reading e.action and e.created_at off it gave an empty line and
     * an Invalid Date, because the shape it returns is { id, at, description }.
     */
    activity: (events as any[]).map((e) => ({
      id: e.id as string,
      said: e.description as string,
      at: e.at as string,
    })),
  };
}

/** What is owed across the studio, said with its currency - Finances' figure, shown here. */
export async function readStudioOwed(): Promise<{ amount: number; currency: string | null; invoices: number }> {
  await getAuthOrgId();
  const invoices = await listInvoices();
  const owing = (invoices as any[])
    .filter((i) => i.status !== 'void' && i.status !== 'draft')
    .map((i) => ({ i, owed: settlementOf(i.total, i.payments || []).outstanding }))
    .filter((x) => x.owed > 0);
  return {
    amount: owing.reduce((n, x) => n + x.owed, 0),
    currency: owing[0]?.i.currency ?? null,
    invoices: owing.length,
  };
}
