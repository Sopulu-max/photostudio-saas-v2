import { listRecentActivity } from '@/kernel/events';
import { readBookingsSheet, MISSING, type BookingsSheet, type SheetBooking, type Period, type MissingKey } from './sheet';
import { getLineConfigurationForm } from './domain';
import { sayDatedSession, sayDatedOccasion, sayTotal, type Say } from './say';

/**
 * THE BOOKINGS DASHBOARD - the day's questions about bookings, each
 * answered with the bookings themselves, decided here so the page draws.
 *
 *   What requires attention? - attention: the edges a live booking has
 *                              not yet grown - a decision, a client, a
 *                              date, a package, a crew for its session.
 *   What is today, and next? - today / week: the sessions ahead.
 *   What is in post-production? - works: booked sessions that have taken
 *                              place with steps still open, oldest first;
 *                              and those finished but not yet closed.
 *   Where is everything?     - pipeline: each stage, how many, and the fact
 *                              that matters for its kind.
 *   What changed recently?   - recent: the last events on bookings, named.
 *   How is the period going? - the sheet's figures and series (sheet.ts).
 *
 * Every widget is a reading of the same rows the day book shows, so it
 * cannot disagree with it, and every widget is a door: it says how to
 * narrow the day book to exactly its question. The conditions are the
 * ontology's - an edge not yet there, a date passed with work open; the
 * values are the studio's - its stages, its people.
 */

export type Position = { service: string; step: string; who: string | null };

export type NextRow = {
  booking: SheetBooking;
  /** The declared crew (assignments): who is coming, by role - a different fact from who is on a step. */
  crew: string[];
  /** One position per service of the booking - its first open step and who is on it - unassigned first. The within-booking hierarchy, on the row. */
  positions: Position[];
  /**
   * Questions the package asked at booking that have no answer yet - what
   * the day still needs to know. Decided by the same rule the booking form
   * uses (getLineConfigurationForm), never re-derived here; read only for
   * the sessions ahead, since that is where an unanswered question costs.
   */
  unanswered: string[];
};

export type WorkRow = {
  booking: SheetBooking;
  /** Days since the session. */
  since: number;
  /** Every open position, unassigned first. */
  open: Position[];
  done: number;
  total: number;
};

export type Attention = {
  key: MissingKey;
  label: string;
  count: number;
  /** The longest wait, or the first date - whichever the condition makes relevant. */
  note: string | null;
  sample: SheetBooking[];
  /** The day book, narrowed to exactly these. */
  narrow: Record<string, string>;
};

export type PipelineStage = {
  key: string;
  label: string;
  look: { kind: string | null; color: string | null } | null;
  kind: string | null;
  count: number;
  /** For a booked stage: sessions ahead, and in post-production. */
  ahead: number;
  inPost: number;
  /** The fact for the kind: an enquiry stage's longest-waiting booking; a booked stage's next session. */
  fact: { booking: SheetBooking; text: string } | null;
};

export type RecentRow = { id: string; at: string; who: string; phrase: string; booking: { id: string; title: string } | null };

/**
 * WHEN EVERYTHING IS (12-BOOKINGS_READABILITY §0.2) - the studio's dated facts
 * in day order, each said. A day appears because something happens on it;
 * sessions and the occasions they are for share the order, because both are
 * points in time and the studio reads them together. The jobs with no date at
 * all are counted, not drawn: that they appear on no day IS the fact.
 */
export type DatedDay = {
  day: string;
  today: boolean;
  lines: { bookingId: string; say: Say }[];
};
export type Dated = {
  days: DatedDay[];
  /** Sessions dated from today onwards, within the window. */
  ahead: number;
  /** Live jobs with no session date - on no day above, and that is the point. */
  undated: number;
  /**
   * EVERY DAY of the window, in order, whether anything happens on it or not -
   * the columns of the axis (components/Readings Days). Position on a dated
   * axis is when, two on one column is a collision, and a run of empty
   * columns is a quiet week: readings a list of days cannot give.
   */
  columns: { day: string; sessions: string[]; occasions: string[]; today: boolean; behind: boolean }[];
  /** The same window by week, each labelled with its own dates and its count. */
  weeks: { from: string; label: string; count: number }[];
};

/**
 * WHAT THE BOOK HAS SOLD, AND WHAT NOBODY HAS ANSWERED - the promise plane
 * read across the book (12 §5). Packages by how many live jobs carry them;
 * each question the studio asks by how far it has been answered, with the
 * total where the answers are quantities (33 outfits is the size of the work
 * the book has promised) and the next one where they are dates.
 */
export type Sold = {
  packages: { name: string; jobs: number }[];
  questions: {
    label: string;
    kind: string;
    answered: number;
    /** The quantity total, or the single answer when only one job has given it. */
    said: string | null;
    next: { bookingId: string; name: string; day: string } | null;
  }[];
};

/** WHAT THE BOOK IS FOR - each dimension the studio defined, counted across live jobs. */
export type ForDimension = {
  id: string;
  name: string;
  values: { id: string; name: string; jobs: number }[];
  /** Live jobs whose packages ask this dimension and that have not answered it. */
  open: number;
};

/**
 * WHOSE MOVE THE DECISION IS - the contract plane, read as the question it
 * answers. `bookedWithoutAgreement` is the disagreement between two planes:
 * the studio moved the job to a booked stage and no contract ever went active.
 */
export type Decision = {
  awaitingStudio: number;
  awaitingClient: number;
  agreed: number;
  bookedWithoutAgreement: number;
};

export type BookingsDashboard = {
  sheet: BookingsSheet;
  attention: Attention[];
  /** Open steps nobody is on, across live jobs, by the role each needs - what the studio is short of. */
  roleTotals: { id: string; name: string; count: number }[];
  dated: Dated;
  sold: Sold;
  forDimensions: ForDimension[];
  decision: Decision;
  today: NextRow[];
  week: NextRow[];
  /** What follows the week, shown only when the week is empty. */
  later: NextRow[];
  works: WorkRow[];
  /** Sessions held, every step done, still in a live stage. */
  toClose: SheetBooking[];
  pipeline: PipelineStage[];
  recent: RecentRow[];
};

const daysBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * `sheet` is passed in when the caller has already read it, which the bookings
 * page always has. Reading it again would double every query behind it - and
 * did, until the page was measured.
 */
export async function readBookingsDashboard(period: Period = 30, given?: BookingsSheet, crew?: Record<string, string[]>): Promise<BookingsDashboard> {
  const [sheet, events] = await Promise.all([
    given ?? readBookingsSheet(period),
    listRecentActivity(6, 'booking'),
  ]);
  const rows = sheet.bands.flatMap((b) => b.rows);
  const live = rows.filter((r) => r.band !== 'closed');
  const { today } = sheet;
  const madeOn = (r: SheetBooking) => r.createdAt.slice(0, 10);
  const byCreated = (a: SheetBooking, b: SheetBooking) => a.createdAt.localeCompare(b.createdAt);
  const bySoon = (a: SheetBooking, b: SheetBooking) => (a.scheduledFor ?? '￿').localeCompare(b.scheduledFor ?? '￿');
  const positionsOf = (r: SheetBooking): Position[] =>
    (r.work?.positions ?? []).filter((p) => !p.done && p.step).map((p) => ({ service: p.service, step: p.step!, who: p.who }));
  const sayDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  // ---- What requires attention: each absence, on the live bookings that have it.
  /* Each absence orders its rows by what makes it urgent, and says so in its note. */
  const attention: Attention[] = MISSING.map((m) => {
    const have = live.filter((r) => (r.takes.missing ?? []).includes(m.key));
    const ordered =
      m.key === 'crew' ? [...have].sort(bySoon)
      : m.key === 'lapsed' ? [...have].sort(bySoon)
      : m.key === 'reminder' ? [...have].sort((a, b) => a.reminders!.earliest.localeCompare(b.reminders!.earliest))
      : [...have].sort(byCreated);
    const first = ordered[0];
    const note = !first ? null
      : m.key === 'crew' ? (first.scheduledFor ? `first ${sayDate(first.scheduledFor)}` : null)
      : m.key === 'lapsed' ? `longest ${plural(daysBetween(first.day!, today), 'day')} since the date`
      : m.key === 'reminder' ? `earliest ${sayDate(first.reminders!.earliest)}`
      : `longest ${plural(daysBetween(madeOn(first), today), 'day')}`;
    return { key: m.key, label: m.label, count: have.length, note, sample: ordered.slice(0, 3), narrow: { missing: m.key } };
  });

  // ---- Today, the rest of the week, and what follows when the week is empty.
  const ahead = live.filter((r) => r.band === 'today' || r.band === 'tomorrow' || r.band === 'week').sort(bySoon);
  const shownAhead = ahead.length > 0
    ? [...ahead.filter((r) => r.band === 'today'), ...ahead.filter((r) => r.band !== 'today').slice(0, 6)]
    : live.filter((r) => r.band === 'later').sort(bySoon).slice(0, 6);
  const unansweredOf = new Map<string, string[]>();
  await Promise.all(shownAhead.map(async (r) => {
    const forms = await Promise.all(r.lineIds.map((id) => getLineConfigurationForm(id).catch(() => [] as any[])));
    unansweredOf.set(r.id, forms.flat().filter((x: any) => x.asked && (x.value === null || x.value === undefined || x.value === '')).map((x: any) => x.label as string));
  }));
  /*
   * THE DECLARED CREW used to be read here, one query per session shown, on
   * top of the register's single query for the whole book. It is the same
   * fact, so the page passes the register's reading in and this asks for
   * nothing (modules/bookings/register: personnel).
   */
  const crewOf = new Map<string, string[]>(crew ? Object.entries(crew) : []);
  const next = (r: SheetBooking): NextRow => ({
    booking: r,
    crew: crewOf.get(r.id) ?? [],
    positions: positionsOf(r).sort((a, b) => Number(Boolean(a.who)) - Number(Boolean(b.who))),
    unanswered: unansweredOf.get(r.id) ?? [],
  });
  const todayRows = shownAhead.filter((r) => r.band === 'today').map(next);
  const weekRows = ahead.length > 0 ? shownAhead.filter((r) => r.band !== 'today').map(next) : [];
  const laterRows = ahead.length === 0 ? shownAhead.map(next) : [];

  // ---- In post-production: booked, session held, steps open - oldest session first; and those done but not closed.
  const held = live.filter((r) => r.stage?.kind === 'booked' && r.day !== null && r.day < today);
  const works: WorkRow[] = held
    .filter((r) => r.work && r.work.done < r.work.total)
    .sort((a, b) => (a.day! < b.day! ? -1 : a.day! > b.day! ? 1 : 0))
    .map((r) => ({
      booking: r, since: daysBetween(r.day!, today),
      open: positionsOf(r).sort((a, b) => Number(Boolean(a.who)) - Number(Boolean(b.who))),
      done: r.work!.done, total: r.work!.total,
    }));
  const toClose = held.filter((r) => r.work && r.work.total > 0 && r.work.done === r.work.total);

  // ---- Where everything is: the studio's stages, with the fact that matters for each kind.
  const pipeline: PipelineStage[] = sheet.byStage.map((st) => {
    const inStage = rows.filter((r) => (r.stage?.id ?? '') === st.key);
    const kind = st.look?.kind ?? null;
    const dated = inStage.filter((r) => r.day !== null && r.day >= today).sort(bySoon);
    const past = inStage.filter((r) => r.day !== null && r.day < today);
    // Time in stage is read from the stage_changed history, not from when the booking was made.
    const longest = [...inStage].sort((a, b) => a.stageSince.localeCompare(b.stageSince))[0];
    const fact = kind === 'booked' && dated[0]
      ? { booking: dated[0], text: `next session ${dated[0].band === 'today' ? 'today' : dated[0].band === 'tomorrow' ? 'tomorrow' : sayDate(dated[0].scheduledFor!)}` }
      : (kind === 'enquiry' || kind === null) && longest
        ? { booking: longest, text: `longest in stage, ${plural(daysBetween(longest.stageSince.slice(0, 10), today), 'day')}` }
        : null;
    return { key: st.key, label: st.label, look: st.look, kind, count: st.count, ahead: dated.length, inPost: kind === 'booked' ? past.length : 0, fact };
  });

  // ---- What changed recently, with the booking named where it still exists.
  const titleOf = new Map(rows.map((r) => [r.id, r.title] as const));
  const recent: RecentRow[] = events.map((e) => ({
    id: e.id, at: e.at, who: e.who, phrase: e.phrase,
    booking: titleOf.has(e.entityId) ? { id: e.entityId, title: titleOf.get(e.entityId)! } : null,
  }));

  // ---- The people plane, read from the other side: open unassigned points by role.
  const roleCount = new Map<string, { id: string; name: string; count: number }>();
  for (const r of live) for (const n of r.needs) {
    const had = roleCount.get(n.id) ?? { id: n.id, name: n.name, count: 0 };
    had.count += 1; roleCount.set(n.id, had);
  }
  const roleTotals = [...roleCount.values()].sort((a, b) => b.count - a.count);

  // ---- When everything is: every dated fact within ±30 days, in day order, said.
  const within30 = (o: number) => o >= -30 && o <= 30;
  const byDay = new Map<string, { bookingId: string; say: Say }[]>();
  const add = (day: string, line: { bookingId: string; say: Say }) =>
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(line);

  for (const r of live) {
    if (r.day && within30(r.planes.axis.session ?? 999)) {
      add(r.day, { bookingId: r.id, say: sayDatedSession(r, today) });
    }
    // A date-kind answer is the occasion the job is for - a different date from the session.
    for (const f of r.facts) {
      if (f.kind !== 'date' || !f.day) continue;
      const offset = Math.round((new Date(`${f.day}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
      if (!within30(offset)) continue;
      if (r.day === f.day) continue; // the session line already says the day
      add(f.day, { bookingId: r.id, say: sayDatedOccasion(r, f.label, f.day, today) });
    }
  }
  // The axis: every day of the window, with what falls on it, named.
  const nameOf = (r: SheetBooking) => r.clientName ?? r.title;
  const sessionsOn = new Map<string, string[]>();
  const occasionsOn = new Map<string, string[]>();
  for (const r of live) {
    if (r.day) (sessionsOn.get(r.day) ?? sessionsOn.set(r.day, []).get(r.day)!).push(nameOf(r));
    for (const f of r.facts) {
      if (f.kind === 'date' && f.day) (occasionsOn.get(f.day) ?? occasionsOn.set(f.day, []).get(f.day)!).push(`${f.label} on ${nameOf(r)}'s job`);
    }
  }
  const dayAt = (offset: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const columns = Array.from({ length: 61 }, (_, i) => {
    const day = dayAt(i - 30);
    return { day, sessions: sessionsOn.get(day) ?? [], occasions: occasionsOn.get(day) ?? [], today: day === today, behind: day < today };
  });
  const weekLabel = (from: string) =>
    new Date(`${from}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weeks = [-28, -21, -14, -7, 0, 7, 14, 21].map((from) => {
    const start = dayAt(from), end = dayAt(from + 7);
    return {
      from: start,
      label: from === 0 ? `this week, from ${weekLabel(start)}` : weekLabel(start),
      count: live.filter((r) => r.day !== null && r.day >= start && r.day < end).length,
    };
  });

  const dated: Dated = {
    days: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, lines]) => ({ day, today: day === today, lines })),
    ahead: live.filter((r) => r.day !== null && r.day >= today && within30(r.planes.axis.session ?? 999)).length,
    undated: live.filter((r) => r.day === null).length,
    columns,
    weeks,
  };

  // ---- What the book has sold: packages by the live jobs that carry them.
  // ---- What the book has sold: packages by the live jobs that carry them.
  const pkgCount = new Map<string, number>();
  for (const r of live) for (const name of new Set(r.packages)) pkgCount.set(name, (pkgCount.get(name) ?? 0) + 1);

  /*
   * And every question the studio asks, by how far it has been answered. Grouped
   * by the label the booking itself uses, because that is the label the operator
   * would recognise (an Occasion Date reads as the Anniversary Date once the
   * booking says Anniversary - kernel/labelledByAnswer, carried on the row).
   */
  type Q = { label: string; kind: string; unit: string | null; jobs: Set<string>; numbers: number[]; dates: { bookingId: string; name: string; day: string }[]; only: string | null };
  const qs = new Map<string, Q>();
  for (const r of live) {
    for (const a of r.answers) {
      if (a.value === null || a.value === undefined || a.value === '') continue;
      const q = qs.get(a.label) ?? { label: a.label, kind: a.kind, unit: a.unit, jobs: new Set<string>(), numbers: [], dates: [], only: null };
      qs.set(a.label, q);
      q.jobs.add(r.id);
      if (a.kind === 'number' && Number.isFinite(Number(a.value))) q.numbers.push(Number(a.value));
      if (a.kind === 'date' && typeof a.value === 'string') {
        const day = a.value.slice(0, 10);
        if (day >= today) q.dates.push({ bookingId: r.id, name: r.clientName ?? r.title, day });
      }
      /*
       * The fact that answers THIS answer, found by the pair (variable, line)
       * and not by the label. The label is per booking by design above, so
       * matching on it can pick the wrong line's fact on a booking that
       * carries the same package twice.
       */
      const said = r.facts.find((f) => f.variableId === a.variableId && f.lineId === a.lineId)?.text ?? null;
      q.only = q.jobs.size === 1 ? said : null;
    }
  }
  const sold: Sold = {
    packages: [...pkgCount.entries()].map(([name, jobs]) => ({ name, jobs })).sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name)),
    questions: [...qs.values()].map((q) => ({
      label: q.label,
      kind: q.kind,
      answered: q.jobs.size,
      said: q.numbers.length > 0 ? sayTotal(q.numbers.reduce((n, x) => n + x, 0), q.unit) : q.only,
      next: q.dates.sort((a, b) => a.day.localeCompare(b.day))[0] ?? null,
    })).sort((a, b) => b.answered - a.answered || a.label.localeCompare(b.label)),
  };

  // ---- What the book is for: each dimension a live job carries, with its values and what it leaves open.
  const dims = new Map<string, ForDimension>();
  for (const r of live) {
    for (const c of r.classification) {
      const d = dims.get(c.dimensionId) ?? { id: c.dimensionId, name: c.dimensionName, values: [], open: 0 };
      dims.set(c.dimensionId, d);
      const v = d.values.find((x) => x.id === c.valueId);
      if (v) v.jobs += 1; else d.values.push({ id: c.valueId, name: c.valueName, jobs: 1 });
    }
    for (const o of r.planes.forOpen) {
      const d = dims.get(o.id) ?? { id: o.id, name: o.name, values: [], open: 0 };
      dims.set(o.id, d);
      d.open += 1;
    }
  }
  const forDimensions = [...dims.values()]
    .map((d) => ({ ...d, values: d.values.sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.values.length - a.values.length || a.name.localeCompare(b.name));

  // ---- Whose move the decision is, and where the stage and the agreement disagree.
  const decision: Decision = {
    awaitingStudio: live.filter((r) => r.stage?.kind !== 'booked' && !r.hasContract && !r.proposalOut).length,
    awaitingClient: live.filter((r) => r.proposalOut).length,
    agreed: live.filter((r) => r.hasContract && !r.proposalOut).length,
    bookedWithoutAgreement: live.filter((r) => r.stage?.kind === 'booked' && !r.hasContract).length,
  };

  return { sheet, attention, roleTotals, dated, sold, forDimensions, decision, today: todayRows, week: weekRows, later: laterRows, works, toClose, pipeline, recent };
}
