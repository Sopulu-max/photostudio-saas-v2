'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { stageBadgeClass } from '@/components/stageBadge';
import { useActed } from '@/components/useActed';
import { wallClockIn } from '@/kernel/wallClock';
import { cardNeeds, sayDay, plural } from '@/modules/bookings/say';
import { setBookingStage, updateBookingRecord } from '@/modules/bookings/interface';
import { addToBookingTeam, removeFromBookingTeam } from '@/modules/production/interface';
import { Menu } from './Workspace';
import type { LensGroup } from '@/kernel/lenses';
import type { RegisterRow, Crew } from '@/modules/bookings/interface';

/**
 * THE REGISTER - the table view of the book.
 *
 * Every booking a row, every fact a booking carries a column, and three verbs
 * only: narrow, group, sort.
 *
 * THE COLUMNS ARE READ OFF THE ROWS, NOT NAMED HERE. They were a fixed list of
 * twelve with their headings written into this file, which meant two things
 * that cannot stand in a product sold to many studios: a studio asking its own
 * questions saw none of them, and the headings were the app's paraphrase rather
 * than the studio's own word. So the columns a studio sees are now derived -
 * one per dimension its bookings are classified by, one per question its
 * packages ask, one per deliverable its bookings commit - and each is titled
 * with the name the data itself carries, verbatim. Define a dimension called
 * Occasion and a column called Occasion appears; rename it and the column is
 * renamed. Nothing about any one studio is written here.
 *
 * WHAT IS NOT DERIVED is only what every booking has by definition - who it is
 * for, what is on it, where it stands, when the session is, who is on it, how
 * far the work has got, how long it has been waiting. Those are the app's own
 * connective words, which is the one vocabulary the app is allowed to supply.
 *
 * MONEY IS NOT HERE, by ruling: what a booking is worth and what is settled are
 * Finances' to report, so `owed` is deliberately not a column although the row
 * carries it.
 *
 * THREE COLUMNS ARE EDITABLE IN PLACE - the stage, the session and the crew -
 * because those are what an operator changes while reading the book, and
 * opening a booking to change one and coming back was the whole cost of a
 * table that could only be read. A cell is a STATEMENT until it is acted on
 * (12-BOOKINGS_READABILITY Law 2): no field, no chevron, nothing that informs
 * nobody. Press it and it becomes a control in place; choose, and it settles
 * back into a statement at once (useActed), with the record catching up behind.
 *
 * THE CUT IS NOT ITS BUSINESS: the rows arrive already cut, because the cut
 * belongs to the page and every view shares it. What belongs to a table alone
 * stays here - the search box, the grouping and the sort - and all three are
 * held in the browser, so none of them is a request.
 *
 * Subtotals sit on the group heading; the totals row sums each column OVER THE
 * CUT, not over the book.
 */

type Ctx = {
  today: string;
  now: number;
  /** The studio's own stages, read off the axes - never a list written here. */
  stages: { key: string; label: string; look: { kind: string | null; color: string | null } | null }[];
  timeZone: string;
  roles: { id: string; name: string }[];
  employees: { id: string; name: string; roleIds: string[] }[];
  editing: string | null;
  setEditing: (cell: string | null) => void;
  act: (key: string, patch: Partial<RegisterRow>, fn: () => Promise<unknown>, whenFailed: string) => void;
  isBusy: (key: string) => boolean;
};

type Column = {
  key: string;
  /** Taken from the data wherever the data names the thing. */
  label: string;
  width: number;
  align?: 'right';
  cell: (r: RegisterRow, c: Ctx) => React.ReactNode;
  total?: (rows: RegisterRow[]) => React.ReactNode;
};

const SORTS: { key: string; label: string; compare: (a: RegisterRow, b: RegisterRow) => number }[] = [
  { key: 'oldest', label: 'Oldest first', compare: (a, b) => a.createdAt.localeCompare(b.createdAt) },
  { key: 'newest', label: 'Newest first', compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
  { key: 'soonest', label: 'Session soonest', compare: (a, b) => (a.scheduledFor ?? '￿').localeCompare(b.scheduledFor ?? '￿') },
  { key: 'client', label: 'By client', compare: (a, b) => (a.clientName ?? '￿').localeCompare(b.clientName ?? '￿') },
  { key: 'activity', label: 'Last moved', compare: (a, b) => (b.lastActivity?.at ?? '').localeCompare(a.lastActivity?.at ?? '') },
];

const ago = (iso: string, now: number) => {
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};

/**
 * A commitment, said.
 *
 * The numeral never appears alone: it is said with the noun the STUDIO counts
 * the thing in (the deliverable's own unit), falling back to the studio's name
 * for the thing itself, verbatim - never lowercased or pluralised, because
 * inflecting a studio's vocabulary is the app rewriting it. And "+?" was a code
 * that needed a legend (Law 1), so what it stood for is now said: a package
 * left the number to somebody.
 */
const saidCommitted = (c: { unit: string | null; quantity: number; extra: number; undecided: boolean }) => {
  const n = c.quantity + c.extra;
  /*
   * The unit is said when the studio declared one, because then it tells the
   * reader something the column's own title does not. Where the studio declared
   * none, the title already carries its word for the thing and repeating it in
   * every cell beneath would be a noun printed ninety times that informs nobody
   * (Law 7) - and a bare numeral is honest here, where the operator chose to
   * tabulate and the header is a restatement rather than a decoder.
   */
  const parts = [c.unit ? `${n} ${c.unit}${n === 1 ? '' : 's'}` : `${n}`];
  if (c.extra > 0) parts.push(`${c.extra} added`);
  if (c.undecided) parts.push('a number left open');
  return parts.join(' · ');
};

const none = (what: string) => <span className="q-reg-none">{what}</span>;

/* ------------------------------------------------------------------ editors */

/**
 * A cell that is a statement until it is pressed.
 *
 * The press target carries no chrome of its own: an operator discovers it by
 * hovering, and the row does not grow twelve chevrons that inform nobody. It
 * stops the row's own click, because the row opens the booking.
 */
function Editable({ cellKey, said, c, children, width }: {
  cellKey: string;
  said: React.ReactNode;
  c: Ctx;
  width?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const open = c.editing === cellKey;
  return (
    <span className="q-reg-edit" data-editable="true">
      <button
        type="button"
        className={open ? 'q-reg-said q-reg-said-open' : 'q-reg-said'}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); c.setEditing(open ? null : cellKey); }}
      >
        {said}
      </button>
      {open && (
        <span className="q-reg-cellpop" style={width ? { minWidth: `${width}px` } : undefined}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          {children(() => c.setEditing(null))}
        </span>
      )}
    </span>
  );
}

function StageCell({ r, c }: { r: RegisterRow; c: Ctx }) {
  const said = r.stage
    ? <span className={`q-badge ${stageBadgeClass(r.stage as any)}`}>{r.stage.name}</span>
    : none('Not set');
  return (
    <Editable cellKey={`${r.id}:stage`} said={said} c={c} width={180}>
      {(close) => (
        <span className="q-reg-choices">
          {c.stages.map((st) => (
            <button
              key={st.key}
              type="button"
              className={r.stage?.id === st.key ? 'q-reg-choice q-reg-choice-on' : 'q-reg-choice'}
              disabled={c.isBusy(r.id)}
              onClick={() => {
                close();
                if (r.stage?.id === st.key) return;
                c.act(
                  r.id,
                  { stage: { id: st.key, name: st.label, kind: st.look?.kind ?? '', color: st.look?.color ?? null } },
                  () => setBookingStage({ bookingId: r.id, stageId: st.key }),
                  'That booking could not be moved.',
                );
              }}
            >
              {st.label}
            </button>
          ))}
        </span>
      )}
    </Editable>
  );
}

function SessionCell({ r, c }: { r: RegisterRow; c: Ctx }) {
  const said = r.day
    ? <span className={r.day === c.today ? 'q-reg-mono q-reg-now' : r.day < c.today ? 'q-reg-mono q-reg-warm' : 'q-reg-mono'}>{sayDay(r.day, c.today)}</span>
    : none('Not scheduled');
  /*
   * The wall clock, sent as typed. The server resolves it against the studio's
   * own timezone - wallClockIn is the same reading the booking's own form uses,
   * so neither of them re-derives the other's arithmetic.
   */
  const current = wallClockIn(r.scheduledFor, c.timeZone);
  const commit = (value: string, close: () => void) => {
    close();
    if (value === current) return;
    c.act(
      r.id,
      { scheduledFor: value || null, day: value ? value.slice(0, 10) : null },
      () => updateBookingRecord({ bookingId: r.id, scheduledFor: value || null }),
      'That session could not be changed.',
    );
  };
  return (
    <Editable cellKey={`${r.id}:session`} said={said} c={c} width={230}>
      {(close) => (
        <span className="q-reg-choices">
          <input
            type="datetime-local"
            className="q-input q-reg-when"
            defaultValue={current}
            autoFocus
            disabled={c.isBusy(r.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit((e.target as HTMLInputElement).value, close);
              if (e.key === 'Escape') close();
            }}
            onBlur={(e) => commit(e.target.value, close)}
          />
          {r.day && (
            <button type="button" className="q-reg-choice" disabled={c.isBusy(r.id)}
                    onClick={() => commit('', close)}>
              Take it off the calendar
            </button>
          )}
        </span>
      )}
    </Editable>
  );
}

function PersonnelCell({ r, c }: { r: RegisterRow; c: Ctx }) {
  const said = r.personnel.length > 0
    ? <span>{r.personnel.map((p) => p.said).join(' · ')}</span>
    : <span className="q-reg-warm">Unassigned</span>;
  const [roleId, setRoleId] = React.useState<string>('');
  // Only people who hold what is being asked for. No role chosen means anyone.
  const eligible = roleId ? c.employees.filter((e) => e.roleIds.includes(roleId)) : c.employees;
  const already = new Set(r.personnel.map((p) => `${p.employeeId}:${p.roleId ?? ''}`));

  const add = (employeeId: string) => {
    const who = c.employees.find((e) => e.id === employeeId);
    if (!who) return;
    const roleName = c.roles.find((x) => x.id === roleId)?.name ?? null;
    c.act(
      r.id,
      {
        personnel: [...r.personnel, {
          // The record names the assignment; until it answers there is none.
          assignmentId: `pending:${employeeId}:${roleId}`,
          employeeId, who: who.name, roleId: roleId || null, roleName,
          said: roleName ? `${who.name} (${roleName})` : who.name,
        } as Crew],
      },
      () => addToBookingTeam({ bookingId: r.id, employeeId, roleId: roleId || null }),
      'That person could not be added.',
    );
  };

  return (
    <Editable cellKey={`${r.id}:personnel`} said={said} c={c} width={260}>
      {() => (
        <span className="q-reg-choices">
          {r.personnel.map((p) => (
            <span key={p.assignmentId} className="q-reg-crew">
              <span className="q-reg-crew-who">{p.said}</span>
              <button
                type="button"
                className="q-reg-drop"
                title={`Take ${p.who} off this booking`}
                disabled={c.isBusy(r.id) || p.assignmentId.startsWith('pending:')}
                onClick={() => c.act(
                  r.id,
                  { personnel: r.personnel.filter((x) => x.assignmentId !== p.assignmentId) },
                  () => removeFromBookingTeam({ bookingId: r.id, assignmentId: p.assignmentId }),
                  'That person could not be taken off.',
                )}
              >
                ×
              </button>
            </span>
          ))}
          {r.personnel.length === 0 && <span className="q-reg-none">Nobody is on this booking</span>}

          {c.roles.length > 0 && (
            <select className="q-select q-reg-pick" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">Any role</option>
              {c.roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <select
            className="q-select q-reg-pick"
            value=""
            disabled={c.isBusy(r.id)}
            onChange={(e) => { if (e.target.value) add(e.target.value); }}
          >
            <option value="">Add somebody…</option>
            {eligible
              .filter((e) => !already.has(`${e.id}:${roleId}`))
              .map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {eligible.length === 0 && (
            <span className="q-reg-none">
              {c.employees.length === 0 ? 'The studio has nobody on its team yet' : 'Nobody holds that role'}
            </span>
          )}
        </span>
      )}
    </Editable>
  );
}

/* ------------------------------------------------------- the derived columns */

/**
 * EVERY FACT THE ROWS CARRY, as columns.
 *
 * The studio-owned ones are discovered from the rows themselves and titled by
 * the name the data holds: a dimension by its own name, a question by its own
 * label, a deliverable by the studio's word for it. Ordered by how many
 * bookings carry each, so the fullest columns come first and a fact one
 * booking in ninety carries does not lead - which is a property of the data,
 * not a preference written here.
 */
function columnsFor(rows: RegisterRow[], lenses: LensGroup[]): Column[] {
  const fixed: Column[] = [
    { key: 'client', label: 'Client', width: 150,
      cell: (r) => (
        <Link href={`/bookings/${r.id}`} className="q-reg-strong" onClick={(e) => e.stopPropagation()}>
          {r.clientName ?? <span className="q-reg-none">No client</span>}
        </Link>
      ),
      total: (rs) => {
        const n = rs.filter((r) => !r.clientName).length;
        return n > 0 ? <span className="q-reg-warm">{n} without a client</span> : null;
      } },
    { key: 'booking', label: 'Booking', width: 190,
      cell: (r) => <span title={r.title}>{r.title}</span> },
    { key: 'package', label: 'Package', width: 200,
      cell: (r) => r.packages.length > 0
        ? <span title={r.packages.join(' · ')}>{r.packages.join(' · ')}</span>
        : none('No package'),
      total: (rs) => {
        const n = rs.filter((r) => r.packages.length === 0).length;
        return n > 0 ? <span className="q-reg-warm">{n} with no package</span> : null;
      } },
    { key: 'stage', label: 'Stage', width: 124, cell: (r, c) => <StageCell r={r} c={c} /> },
    { key: 'session', label: 'Session', width: 168, cell: (r, c) => <SessionCell r={r} c={c} />,
      total: (rs) => {
        const n = rs.filter((r) => !r.day).length;
        return n > 0 ? <span className="q-reg-warm">{n} not scheduled</span> : null;
      } },
    { key: 'decision', label: 'Decision', width: 110,
      cell: (r) => r.hasContract && !r.proposalOut ? <span>Agreed</span>
        : r.proposalOut ? <span>Issued</span>
        : <span className="q-reg-warm">Not issued</span>,
      total: (rs) => {
        const issued = rs.filter((r) => r.proposalOut).length;
        return issued > 0 ? <span>{issued} issued</span> : null;
      } },
    { key: 'personnel', label: 'Personnel', width: 180, cell: (r, c) => <PersonnelCell r={r} c={c} />,
      total: (rs) => {
        const short = rs.filter((r) => r.personnel.length === 0).length;
        return short > 0 ? <span className="q-reg-warm">{short} unassigned</span> : null;
      } },
    { key: 'steps', label: 'Steps', width: 108,
      cell: (r) => r.work && r.work.total > 0
        ? <span className="q-reg-steps" title={`${r.work.done} of ${r.work.total} steps done`}>
            <span className="q-reg-track">
              <i className={r.work.done === r.work.total ? 'q-reg-fill q-reg-fill-done' : 'q-reg-fill'}
                 style={{ '--q-share': Math.round((r.work.done / r.work.total) * 100) } as React.CSSProperties} />
            </span>
            <span className="q-reg-mono">{r.work.done}/{r.work.total}</span>
          </span>
        : none('No steps'),
      total: (rs) => {
        const done = rs.reduce((n, r) => n + (r.work?.done ?? 0), 0);
        const all = rs.reduce((n, r) => n + (r.work?.total ?? 0), 0);
        return all > 0 ? <span>{done} of {all} done</span> : null;
      } },
    { key: 'needs', label: 'Roles needed', width: 150,
      cell: (r) => r.needs.length > 0
        ? <span className="q-reg-warm">{r.needs.map((n) => n.name).join(' · ')}</span>
        : none('Nobody needed'),
      total: (rs) => {
        const n = rs.filter((r) => r.needs.length > 0).length;
        return n > 0 ? <span className="q-reg-warm">{n} short</span> : null;
      } },
    { key: 'reminders', label: 'Reminders due', width: 130,
      cell: (r) => r.reminders
        ? <span className="q-reg-warm">{plural(r.reminders.count, 'reminder')} due</span>
        : none('None due'),
      total: (rs) => {
        const n = rs.reduce((t, r) => t + (r.reminders?.count ?? 0), 0);
        return n > 0 ? <span className="q-reg-warm">{plural(n, 'reminder')} due</span> : null;
      } },
    { key: 'outstanding', label: 'Outstanding', width: 160,
      cell: (r) => {
        const need = cardNeeds(r);
        return need ? <span className="q-reg-warm">{need}</span> : none('Nothing');
      },
      total: (rs) => {
        const n = rs.filter((r) => cardNeeds(r)).length;
        return n > 0 ? <span className="q-reg-warm">{n} outstanding</span> : null;
      } },
    { key: 'instage', label: 'In stage', width: 78, align: 'right',
      cell: (r, c) => <span className="q-reg-mono">{ago(r.stageSince, c.now)}</span> },
    { key: 'age', label: 'Age', width: 64, align: 'right',
      cell: (r, c) => <span className="q-reg-mono">{ago(r.createdAt, c.now)}</span> },
    { key: 'activity', label: 'Last moved', width: 100, align: 'right',
      cell: (r, c) => r.lastActivity
        ? <span className="q-reg-mono" title={`${r.lastActivity.action.replace(/_/g, ' ')} · ${new Date(r.lastActivity.at).toLocaleString('en-GB')}`}>{ago(r.lastActivity.at, c.now)} ago</span>
        : none('Never moved') },
  ];

  // ---- one column per dimension the studio classifies bookings by
  const dims = new Map<string, { name: string; rows: number }>();
  for (const r of rows) {
    for (const cl of r.classification) {
      const had = dims.get(cl.dimensionId) ?? { name: cl.dimensionName, rows: 0 };
      had.rows += 1;
      dims.set(cl.dimensionId, had);
    }
  }
  /*
   * A dimension a studio asks but no booking in this cut has answered still
   * gets its column, because "not stated" is a fact worth reading (Law 6) and
   * the axes already know the dimension exists.
   */
  for (const g of lenses) {
    if (!g.key.startsWith('dim:')) continue;
    const id = g.key.slice(4);
    if (!dims.has(id)) dims.set(id, { name: g.label, rows: 0 });
  }
  const dimensionColumns: Column[] = [...dims.entries()]
    .sort((a, b) => b[1].rows - a[1].rows || a[1].name.localeCompare(b[1].name))
    .map(([id, d]) => ({
      key: `dim:${id}`,
      label: d.name,
      width: 150,
      cell: (r: RegisterRow) => {
        const mine = r.classification.filter((c) => c.dimensionId === id);
        return mine.length > 0 ? <span>{mine.map((c) => c.valueName).join(' · ')}</span> : none('Not stated');
      },
      total: (rs: RegisterRow[]) => {
        const n = rs.filter((r) => !r.classification.some((c) => c.dimensionId === id)).length;
        return n > 0 ? <span>{n} not stated</span> : null;
      },
    }));

  /*
   * ---- one column per question the studio's packages ask
   *
   * THE KIND TRAVELS WITH THE NAME. A studio defines these on its services and
   * deliverables and its packages leave them open, so the column has to read
   * not just what the question is CALLED but what it IS: a number is counted
   * and belongs against the right-hand edge with its kin, a date is a point in
   * time, a yes-or-no is a word. The text itself is already said by the kind
   * that declared it (sheet.ts sayAnswer) and is NOT re-read here - parsing it
   * back into a number to sum would be the app second-guessing a value the
   * studio's own unit already settled.
   *
   * Where two questions share a name but not a kind, they are two columns: the
   * name is not the identity, the pair is.
   */
  const asked = new Map<string, { label: string; kind: string; rows: number }>();
  for (const r of rows) {
    for (const f of r.facts) {
      const id = `${f.label}\u0000${f.kind}`;
      const had = asked.get(id) ?? { label: f.label, kind: f.kind, rows: 0 };
      had.rows += 1;
      asked.set(id, had);
    }
  }
  const counted = (kind: string) => kind === 'number' || kind === 'size';
  const factColumns: Column[] = [...asked.entries()]
    .sort((a, b) => b[1].rows - a[1].rows || a[1].label.localeCompare(b[1].label))
    .map(([, q]) => ({
      key: `fact:${q.label}:${q.kind}`,
      label: q.label,
      width: q.kind === 'boolean' ? 110 : counted(q.kind) ? 124 : 155,
      align: counted(q.kind) ? ('right' as const) : undefined,
      cell: (r: RegisterRow) => {
        const mine = r.facts.filter((f) => f.label === q.label && f.kind === q.kind);
        if (mine.length === 0) return none('Unanswered');
        const said = mine.map((f) => f.text).join(' · ');
        return <span className={counted(q.kind) ? 'q-reg-mono' : undefined} title={said}>{said}</span>;
      },
      total: (rs: RegisterRow[]) => {
        const n = rs.filter((r) => !r.facts.some((f) => f.label === q.label && f.kind === q.kind)).length;
        return n > 0 ? <span>{n} unanswered</span> : null;
      },
    }));

  // ---- one column per deliverable the studio's bookings commit
  const owes = new Map<string, number>();
  for (const r of rows) for (const cm of r.committed) owes.set(cm.deliverable, (owes.get(cm.deliverable) ?? 0) + 1);
  const committedColumns: Column[] = [...owes.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([deliverable]) => ({
      key: `owes:${deliverable}`,
      label: deliverable,
      width: 150,
      align: 'right' as const,
      cell: (r: RegisterRow) => {
        const mine = r.committed.find((c) => c.deliverable === deliverable);
        return mine
          ? <span className="q-reg-mono" title={saidCommitted(mine)}>{saidCommitted(mine)}</span>
          : none('None owed');
      },
      total: (rs: RegisterRow[]) => {
        let n = 0;
        let unit: string | null = null;
        for (const r of rs) {
          const mine = r.committed.find((c) => c.deliverable === deliverable);
          if (!mine) continue;
          n += mine.quantity + mine.extra;
          unit = mine.unit;
        }
        if (n === 0) return null;
        return <span className="q-reg-mono">{unit ? `${n} ${unit}${n === 1 ? '' : 's'}` : n}</span>;
      },
    }));

  return [...fixed, ...dimensionColumns, ...factColumns, ...committedColumns];
}

export function Register({ rows, lenses, today, timeZone, roles, employees, group, onGroup, sort: sortKey, onSort }: {
  rows: RegisterRow[];
  lenses: LensGroup[];
  today: string;
  timeZone: string;
  roles: { id: string; name: string }[];
  employees: { id: string; name: string; roleIds: string[] }[];
  /** The axis rows are grouped under, or none - the operator's, held by the page. */
  group: string | null;
  onGroup: (group: string | null) => void;
  sort: string;
  onSort: (sort: string) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [editing, setEditing] = React.useState<string | null>(null);
  const now = React.useMemo(() => Date.now(), []);

  // A cell settles the moment it is chosen; the record catches up behind it.
  const { shown, act, isBusy } = useActed(rows, (r) => r.id);

  const COLUMNS = React.useMemo(() => columnsFor(shown, lenses), [shown, lenses]);
  const stages = React.useMemo(
    () => (lenses.find((g) => g.key === 'stage')?.items ?? []).map((i) => ({ key: i.key, label: i.label, look: i.look ?? null })),
    [lenses],
  );

  const ctx: Ctx = { today, now, stages, timeZone, roles, employees, editing, setEditing, act, isBusy };

  const narrowed = search.trim()
    ? shown.filter((r) => [r.title, r.clientName, ...r.packages, ...r.personnel.map((p) => p.said)]
        .join(' ').toLowerCase().includes(search.trim().toLowerCase()))
    : shown;

  const sort = SORTS.find((s) => s.key === sortKey) ?? SORTS[0];
  const ordered = [...narrowed].sort(sort.compare);

  const groupBy = group ? lenses.find((g) => g.key === group) ?? null : null;
  const groups = groupBy
    ? [
        ...groupBy.items.map((it) => ({
          key: it.key, label: it.label, look: it.look ?? null,
          rows: ordered.filter((r) => (r.takes[groupBy.key] ?? []).includes(it.key)),
        })),
        ...(groupBy.none ? [{
          key: '__none__', label: groupBy.none, look: null,
          rows: ordered.filter((r) => (r.takes[groupBy.key] ?? []).length === 0),
        }] : []),
      ].filter((g) => g.rows.length > 0)
    : [{ key: 'all', label: '', look: null, rows: ordered }];

  const grid = { gridTemplateColumns: COLUMNS.map((c) => `${c.width}px`).join(' ') } as React.CSSProperties;
  const width = COLUMNS.reduce((n, c) => n + c.width, 0) + COLUMNS.length * 12 + 32;

  /*
   * The row still opens the booking, but it is no longer an anchor wrapping
   * everything: a control cannot live inside a link, and three of these cells
   * are controls. The client's name is a real link, so the keyboard and a
   * middle click still work, and the row navigates on a press that did not
   * land on something editable.
   */
  const openRow = (e: React.MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest('[data-editable]')) return;
    router.push(`/bookings/${id}`);
  };

  return (
    <section className="q-reg">
      <div className="q-reg-bar">
        <input className="q-reg-search" value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Search client, package, personnel" aria-label="Search the register" />
        <Menu label={groupBy ? `Group: ${groupBy.label}` : 'Group'} items={[
          { label: 'No grouping', on: !groupBy, act: () => onGroup(null) },
          ...lenses.map((g) => ({ label: g.label, on: group === g.key, act: () => onGroup(g.key) })),
        ]} />
        <Menu label={`Sort: ${sort.label}`} items={SORTS.map((s) => ({
          label: s.label, on: sort.key === s.key, act: () => onSort(s.key),
        }))} />
        {search.trim() && (
          <span className="q-reg-count">{ordered.length} of {plural(shown.length, 'booking')} match the search</span>
        )}
      </div>

      <div className="q-reg-scroll">
        <div style={{ minWidth: `${width}px` }}>
          <div className="q-reg-head" style={grid}>
            {COLUMNS.map((c) => (
              <span key={c.key} className={c.align === 'right' ? 'q-reg-h q-reg-right' : 'q-reg-h'}>{c.label}</span>
            ))}
          </div>

          {groups.map((g) => (
            <React.Fragment key={g.key}>
              {groupBy && (
                <div className="q-reg-group">
                  {g.look?.color && <i className={`q-reg-dot q-dist-c-${g.look.color}`} />}
                  <span className="q-reg-group-name">{g.label}</span>
                  <span className="q-reg-group-n">{plural(g.rows.length, 'booking')}</span>
                  {COLUMNS.filter((c) => c.total).map((c) => {
                    const t = c.total!(g.rows);
                    return t ? <span key={c.key} className="q-reg-group-sum">{t}</span> : null;
                  })}
                </div>
              )}
              {g.rows.map((r) => (
                <div
                  key={r.id}
                  className={isBusy(r.id) ? 'q-reg-row q-reg-row-busy' : 'q-reg-row'}
                  style={grid}
                  onClick={(e) => openRow(e, r.id)}
                >
                  {COLUMNS.map((c) => (
                    <span key={c.key} className={c.align === 'right' ? 'q-reg-cell q-reg-right' : 'q-reg-cell'}>
                      {c.cell(r, ctx)}
                    </span>
                  ))}
                </div>
              ))}
            </React.Fragment>
          ))}

          {ordered.length === 0 ? (
            <p className="q-reg-empty">No booking answers this cut. Remove a filter above to widen it.</p>
          ) : (
            <div className="q-reg-totals" style={grid}>
              {COLUMNS.map((c, i) => (
                <span key={c.key} className={c.align === 'right' ? 'q-reg-total q-reg-right' : 'q-reg-total'}>
                  {c.total ? c.total(ordered) : i === 0 ? plural(ordered.length, 'booking') : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
