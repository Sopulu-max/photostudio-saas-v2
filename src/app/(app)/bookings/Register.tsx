'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { stageBadgeClass } from '@/components/stageBadge';
import { useActed } from '@/components/useActed';
import { wallClockIn } from '@/kernel/wallClock';
import { sayDay, plural } from '@/modules/bookings/say';
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
 * THE COLUMNS ARE ONLY WHAT EVERY BOOKING HAS. Client, Booking, Packages,
 * Stage, Session, Contract, Crew, Steps, Roles, Notes - the facts a booking
 * carries by definition, so a column is a claim that holds for every row.
 *
 * WHAT A STUDIO NAMES IS NOT HERE, and that is the point. Its dimensions, the
 * questions its packages leave open, the deliverables it commits - those were
 * columns for a while, titled with the studio's own words, and the table was
 * measured: ten of them carried something for three bookings or fewer out of
 * twenty-nine, because what a booking is asked follows from the packages on it
 * and no two bookings need be asked the same things. A column asserts that its
 * fact applies to every row, so a column per question was an assertion the
 * data does not support. They belong to the booking's own page, where each one
 * sits under the package that asked it.
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
  const said_ref = React.useRef<HTMLButtonElement | null>(null);
  const [at, setAt] = React.useState<{ top: number; left: number } | null>(null);

  /*
   * ANCHORED TO THE VIEWPORT, NOT TO THE CELL.
   *
   * It was absolutely positioned inside the cell, which put it inside
   * .q-reg-scroll - and a table that scrolls sideways has overflow set, so the
   * browser clipped the menu at the table's edge. On every row but the first
   * one it opened somewhere nobody could see it, which reads exactly like a
   * cell that cannot be edited. So its position is measured off the pressed
   * statement and it is drawn against the window, where nothing can clip it.
   */
  const pop_ref = React.useRef<HTMLSpanElement | null>(null);
  /*
   * Below the statement, unless the window has no room - then above it. A row
   * near the foot of the screen is exactly where an operator works, so opening
   * off the bottom edge is the same bug again in a different direction.
   */
  const place = () => {
    const box = said_ref.current?.getBoundingClientRect();
    if (!box) return;
    const pop = pop_ref.current?.getBoundingClientRect();
    const h = pop?.height ?? 0;
    const w = pop?.width ?? 0;
    let top = box.bottom + 6;
    if (h && top + h > window.innerHeight - 8) top = Math.max(8, box.top - h - 6);
    let left = box.left - 6;
    if (w && left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    setAt((had) => (had && had.top === top && had.left === left ? had : { top, left }));
  };

  React.useLayoutEffect(() => { if (open && at) place(); }, [open, at?.top, at?.left]);

  React.useEffect(() => {
    if (!open) return;
    place();
    // A menu that will not close is as broken as one that never opened.
    const away = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-editable]')) c.setEditing(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') c.setEditing(null); };
    // The table scrolls under it, so it follows what it is anchored to.
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  return (
    <span className="q-reg-edit" data-editable="true">
      <button
        ref={said_ref}
        type="button"
        className={open ? 'q-reg-said q-reg-said-open' : 'q-reg-said'}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); c.setEditing(open ? null : cellKey); }}
      >
        {said}
      </button>
      {open && at && (
        <span
          ref={pop_ref}
          className="q-reg-cellpop"
          style={{ top: `${at.top}px`, left: `${at.left}px`, ...(width ? { minWidth: `${width}px` } : {}) }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
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
function columnsFor(): Column[] {
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
    { key: 'package', label: 'Packages', width: 200,
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
    { key: 'decision', label: 'Contract', width: 110,
      cell: (r) => r.hasContract && !r.proposalOut ? <span>Agreed</span>
        : r.proposalOut ? <span>Issued</span>
        : <span className="q-reg-warm">Not issued</span>,
      total: (rs) => {
        const issued = rs.filter((r) => r.proposalOut).length;
        return issued > 0 ? <span>{issued} issued</span> : null;
      } },
    { key: 'personnel', label: 'Crew', width: 180, cell: (r, c) => <PersonnelCell r={r} c={c} />,
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
    { key: 'needs', label: 'Roles', width: 150,
      cell: (r) => r.needs.length > 0
        ? <span className="q-reg-warm">{r.needs.map((n) => n.name).join(' · ')}</span>
        : none('Nobody needed'),
      total: (rs) => {
        const n = rs.filter((r) => r.needs.length > 0).length;
        return n > 0 ? <span className="q-reg-warm">{n} short</span> : null;
      } },
    { key: 'reminders', label: 'Notes', width: 130,
      cell: (r) => r.reminders
        ? <span className="q-reg-warm">{plural(r.reminders.count, 'reminder')} due</span>
        : none('None due'),
      total: (rs) => {
        const n = rs.reduce((t, r) => t + (r.reminders?.count ?? 0), 0);
        return n > 0 ? <span className="q-reg-warm">{plural(n, 'reminder')} due</span> : null;
      } },
  ];

  return fixed;
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

  // A cell settles the moment it is chosen; the record catches up behind it.
  const { shown, act, isBusy } = useActed(rows, (r) => r.id);

  const COLUMNS = React.useMemo(() => columnsFor(), []);
  const stages = React.useMemo(
    () => (lenses.find((g) => g.key === 'stage')?.items ?? []).map((i) => ({ key: i.key, label: i.label, look: i.look ?? null })),
    [lenses],
  );

  const ctx: Ctx = { today, stages, timeZone, roles, employees, editing, setEditing, act, isBusy };

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
