'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { studioHoursFor, localInstant, studioTimezone } from '@/kernel/studioHours';
import { assertOurs } from '@/kernel/tenancy';
import { revalidatePath } from 'next/cache';
// A 'use server' file may only export async functions, so the seven days live
// in a plain module next door.
import { WEEKDAYS } from './weekdays';

/**
 * Who turned up.
 *
 * Everything else this system knows about a person is planned: a role they
 * hold, a task they were given, a booking they are crewed on. None of it says
 * anyone was ever in the building. Attendance is the first fact about a person
 * that is simply what happened.
 *
 * A shared device at the door: the roster is on screen, you tap your name.
 * That is why nothing here checks who is asking — the studio's own device is
 * signed in, and `recordedBy` keeps the operator so a correction is traceable
 * rather than anonymous.
 *
 * One row per person per working day. Tapping check-in twice cannot produce two
 * mornings; tapping it again after leaving means you came back, so the day's
 * span becomes first arrival to last leaving.
 */

export type AttendanceToday = {
  employeeId: string;
  name: string;
  avatarUrl: string | null;
  roles: { id: string; name: string }[];
  workingDays: number[];
  /** Is today one of their days? False only when they have said, and today isn't. */
  expectedToday: boolean;
  attendanceId: string | null;
  /** Minutes past opening, when the studio has said when it opens and they were late. */
  lateBy: number | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  /**
   * in    — here now
   * out   — came and left
   * away  — a day they work, and they haven't come
   * off   — not one of their days
   *
   * `off` outranks `away` only when nobody has turned up: someone who comes in
   * on their day off is here, and pretending otherwise would be the board
   * arguing with the room.
   */
  state: 'in' | 'out' | 'away' | 'off';
};



/**
 * The studio's own today.
 *
 * A working day is a fact about the studio, not about UTC — 9pm in Lagos is
 * still today's shift. Resolved here so every caller agrees on which day it is,
 * and frozen onto the row so a later timezone correction cannot move history.
 */
async function studioToday(orgId: string): Promise<{
  workDate: string; timezone: string; isoWeekday: number;
  opensAt: string | null; closesAt: string | null; closed: boolean; openingLabel: string | null;
}> {
  const timezone = await studioTimezone(orgId);
  const now = new Date();
  // en-CA gives YYYY-MM-DD, which is what a `date` column wants.
  const workDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

  // Which weekday it is where the studio is — not where the server is. Near
  // midnight those are different days, and a Sunday shift would otherwise read
  // as a Monday one.
  const short = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short' }).format(now);
  const isoWeekday = WEEKDAYS.find((d) => d.short === short)?.iso ?? 1;

  /*
   * What time the studio opens TODAY, which is not always its usual time.
   *
   * Asked of the database rather than worked out here, because the question is
   * calendar arithmetic — is this the last Saturday of the month, has the month
   * run out — and because the answer depends on rules the studio wrote. The
   * function already knows the precedence: a named date beats a rule about the
   * last Saturday, which beats a rule about every Saturday, which beats the
   * ordinary time.
   */
  const hours = await studioHoursFor(orgId, workDate);

  return {
    workDate,
    timezone,
    isoWeekday,
    opensAt: hours.opensAt,
    closesAt: hours.closesAt,
    closed: hours.closed,
    openingLabel: hours.label,
  };
}

/**
 * A wall-clock time on a working day, as an instant.
 *
 * Postgres does the conversion because it carries the timezone database and
 * knows the offset that applied on that date. Doing it here would be wrong for
 * one hour twice a year wherever daylight saving applies.
 */
const instantFor = localInstant;

/** What today looks like: the whole roster, each with where they stand. */
export async function getAttendanceToday(): Promise<{
  workDate: string; timezone: string; isoWeekday: number;
  opensAt: string | null; closesAt: string | null;
  closed: boolean; openingLabel: string | null; roster: AttendanceToday[];
}> {
  const { orgId } = await getAuthOrgId();
  const { workDate, timezone, isoWeekday, opensAt, closesAt, closed, openingLabel } = await studioToday(orgId);

  /*
   * When today's opening actually was, as an instant.
   *
   * Resolved once for the whole board rather than per person, and resolved in
   * Postgres because the offset that applied on THIS date is a timezone
   * database question. Comparing two instants is then exact; comparing wall
   * clocks in JavaScript would be wrong for an hour twice a year.
   *
   * A studio that has not said when it opens has no opening instant, and
   * nobody on the board is late.
   */
  const openedAt = opensAt && !closed
    ? new Date(await instantFor(workDate, opensAt, timezone)).getTime()
    : null;

  const { data: employees } = await supabaseAdmin
    .from('employees')
    .select('id, status, working_days, contact:contacts(display_name, avatar_url), employee_roles(role:roles(id, name))')
    .eq('organization_id', orgId)
    .eq('status', 'active');

  const { data: today } = await supabaseAdmin
    .from('attendance')
    .select('id, employee_id, checked_in_at, checked_out_at')
    .eq('organization_id', orgId)
    .eq('work_date', workDate);

  const byEmployee = new Map(((today || []) as any[]).map((a) => [a.employee_id, a]));

  const roster: AttendanceToday[] = ((employees || []) as any[])
    .map((e) => {
      const record = byEmployee.get(e.id);
      const workingDays = ((e.working_days || []) as number[]).slice().sort((a, b) => a - b);
      // Nothing said means nothing assumed: they are treated as possibly in,
      // exactly as before anyone described their week.
      // A closed studio expects nobody. The studio's own day outranks a
      // person's week: someone whose Saturday it is, is still not due in on a
      // Saturday the studio has shut. They can still be checked in — the
      // register records what happened, not what was planned.
      const expectedToday = !closed
        && (workingDays.length === 0 || workingDays.includes(isoWeekday));

      return {
        employeeId: e.id as string,
        name: (e.contact?.display_name ?? 'Unnamed') as string,
        avatarUrl: (e.contact?.avatar_url ?? null) as string | null,
        roles: (e.employee_roles || []).map((er: any) => er.role).filter((r: any) => r?.id),
        workingDays,
        expectedToday,
        attendanceId: (record?.id ?? null) as string | null,
        // Late is only ever a statement about someone who actually arrived.
        lateBy: openedAt && record?.checked_in_at
          ? Math.max(0, Math.round((new Date(record.checked_in_at).getTime() - openedAt) / 60000)) || null
          : null,
        checkedInAt: (record?.checked_in_at ?? null) as string | null,
        checkedOutAt: (record?.checked_out_at ?? null) as string | null,
        state: record
          ? (record.checked_out_at ? 'out' : 'in')
          : (expectedToday ? 'away' : 'off'),
      } as AttendanceToday;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { workDate, timezone, isoWeekday, opensAt, closesAt, closed, openingLabel, roster };
}

/** "09:00". The shape an <input type="time"> produces. */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The hours this studio keeps.
 *
 * Two parts on screen, one question in the database. The ordinary week is a
 * schedule; a rule about the last Saturday is an exception to that schedule.
 * Both resolve through the same function, in the same order of specificity.
 */
export async function listStudioHours() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('studio_hours')
    .select('id, label, on_date, weekday, week_of_month, opens_at, closes_at, closed')
    .eq('organization_id', orgId)
    .order('on_date', { ascending: true, nullsFirst: false })
    .order('weekday', { ascending: true });
  if (error) console.error('Failed to load the studio hours:', error);

  const rows = ((data || []) as any[]).map((h) => ({
    id: h.id as string,
    label: (h.label ?? null) as string | null,
    onDate: (h.on_date ?? null) as string | null,
    weekday: (h.weekday ?? null) as number | null,
    weekOfMonth: (h.week_of_month ?? null) as number | null,
    opensAt: h.opens_at ? (h.opens_at as string).slice(0, 5) : null,
    closesAt: h.closes_at ? (h.closes_at as string).slice(0, 5) : null,
    closed: !!h.closed,
  }));

  const weekly = rows.filter((r) => r.onDate === null && r.weekOfMonth === null);
  // Always seven rows, in order, whether or not the studio has said anything
  // about a given day. A schedule with gaps in it is not a schedule to edit.
  const week = WEEKDAYS.map((d) => {
    const found = weekly.find((r) => r.weekday === d.iso);
    return {
      weekday: d.iso,
      opensAt: found?.opensAt ?? null,
      closesAt: found?.closesAt ?? null,
      closed: found?.closed ?? false,
      /** False when the studio has never spoken about this day. */
      stated: !!found,
    };
  });

  return { week, exceptions: rows.filter((r) => r.onDate !== null || r.weekOfMonth !== null) };
}

/**
 * The ordinary week, saved whole.
 *
 * Seven days arrive together because that is how the form is read and edited;
 * saving one at a time would let a half-written week reach the board. The
 * weekly rows are replaced rather than patched, so a day the studio has gone
 * quiet about returns to unstated instead of keeping a time nobody meant.
 */
export async function setWeeklyHours(input: {
  days: { weekday: number; opensAt?: string | null; closesAt?: string | null; closed?: boolean }[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const rows = (input.days || [])
    .filter((d) => Number.isInteger(d.weekday) && d.weekday >= 1 && d.weekday <= 7)
    .map((d) => {
      const closed = !!d.closed;
      const opensAt = closed ? null : (d.opensAt || '').trim() || null;
      const closesAt = closed ? null : (d.closesAt || '').trim() || null;
      if (opensAt && !TIME.test(opensAt)) throw new Error('Give the opening time as 09:00.');
      if (closesAt && !TIME.test(closesAt)) throw new Error('Give the closing time as 17:00.');
      // A closing time with no opening time says a studio shut without ever
      // having opened. The schema would take it; it still means nothing.
      if (!closed && closesAt && !opensAt) {
        throw new Error('Say when that day opens before saying when it closes.');
      }
      return { weekday: d.weekday, closed, opensAt, closesAt };
    });

  // A day with nothing said about it keeps no row, so it falls through to the
  // studio's default exactly as it did before anyone described the week.
  const keep = rows.filter((r) => r.closed || r.opensAt);

  const { error: clearError } = await supabaseAdmin
    .from('studio_hours').delete()
    .eq('organization_id', orgId)
    .is('on_date', null)
    .is('week_of_month', null);
  if (clearError) {
    console.error('Failed to clear the weekly hours:', clearError);
    throw new Error('The week could not be saved.');
  }

  if (keep.length > 0) {
    const { error } = await supabaseAdmin.from('studio_hours').insert(
      keep.map((r) => ({
        organization_id: orgId,
        weekday: r.weekday,
        opens_at: r.opensAt,
        closes_at: r.closesAt,
        closed: r.closed,
      })),
    );
    if (error) {
      console.error('Failed to save the weekly hours:', error);
      throw new Error('The week could not be saved.');
    }
  }

  await logEvent({
    organizationId: orgId, entityType: 'organization', entityId: orgId,
    action: 'weekly_hours_set', actorId: actorId ?? undefined, payload: { days: keep },
  });
  revalidatePath('/attendance');
  revalidatePath('/settings');
  return { ok: true };
}

/**
 * A day that breaks the week.
 *
 * Either a date — a public holiday, one Tuesday the power went — or one
 * occurrence of a weekday, which is how "the last Saturday of the month" is
 * said without the system needing to know what happens on it.
 */
export async function addHoursException(input: {
  label: string;
  onDate?: string | null;
  weekday?: number | null;
  /** -1 = last in the month, 1..5 = the nth. */
  weekOfMonth?: number | null;
  opensAt?: string | null;
  closesAt?: string | null;
  closed?: boolean;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const label = (input.label || '').trim();
  // Named, because the board has to say why today is not the usual time.
  if (!label) throw new Error('Give the day a name, so the board can say why.');

  const onDate = (input.onDate || '').trim() || null;
  const weekday = input.weekday ?? null;
  if (!onDate && !weekday) throw new Error('Choose a date or a day of the week.');
  if (onDate && weekday) throw new Error('A date or a day of the week, not both.');
  if (weekday !== null && (weekday < 1 || weekday > 7)) throw new Error('That is not a day of the week.');

  const closed = !!input.closed;
  const opensAt = closed ? null : (input.opensAt || '').trim() || null;
  const closesAt = closed ? null : (input.closesAt || '').trim() || null;
  if (!closed && !opensAt) throw new Error('Give an opening time, or mark the studio closed.');
  if (opensAt && !TIME.test(opensAt)) throw new Error('Give the opening time as 10:00.');
  if (closesAt && !TIME.test(closesAt)) throw new Error('Give the closing time as 14:00.');

  const { error } = await supabaseAdmin.from('studio_hours').insert({
    organization_id: orgId,
    label,
    on_date: onDate,
    weekday: onDate ? null : weekday,
    week_of_month: onDate ? null : (input.weekOfMonth ?? null),
    opens_at: opensAt,
    closes_at: closesAt,
    closed,
  });
  if (error) {
    console.error('Failed to add the day:', error);
    // The unique indexes: one rule per date, one per nth weekday.
    if ((error as any).code === '23505') throw new Error('There is already a rule for that day.');
    throw new Error('That day could not be saved.');
  }

  await logEvent({
    organizationId: orgId, entityType: 'organization', entityId: orgId,
    action: 'hours_exception_added', actorId: actorId ?? undefined,
    payload: { label, onDate, weekday, weekOfMonth: input.weekOfMonth ?? null, opensAt, closesAt, closed },
  });
  revalidatePath('/attendance');
  revalidatePath('/settings');
  return { ok: true };
}

/** The studio no longer treats that kind of day differently. */
export async function removeHoursException(id: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('studio_hours').delete()
    .eq('id', id).eq('organization_id', orgId);
  if (error) {
    console.error('Failed to remove the day:', error);
    throw new Error('That day could not be removed.');
  }
  await logEvent({
    organizationId: orgId, entityType: 'organization', entityId: orgId,
    action: 'hours_exception_removed', actorId: actorId ?? undefined, payload: { id },
  });
  revalidatePath('/attendance');
  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Arrived.
 *
 * Idempotent by the day: a second tap on a morning already recorded changes
 * nothing, and a tap after leaving means they are back — `checked_out_at`
 * clears rather than the arrival being overwritten, so the day keeps the time
 * they actually got in.
 */
export async function checkIn(employeeId: string, atLocalTime?: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  await assertOurs(orgId, [{ table: 'employees', id: employeeId, label: 'team member' }]);
  const { workDate, timezone } = await studioToday(orgId);
  // The time is part of the action, not a correction afterwards: somebody who
  // arrived at eight and is tapping at ten types eight and is done.
  const stampedAt = atLocalTime ? await instantFor(workDate, atLocalTime, timezone) : null;

  const { data: existing } = await supabaseAdmin
    .from('attendance')
    .select('id, checked_in_at, checked_out_at')
    .eq('organization_id', orgId)
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .maybeSingle();

  // The time that comes back is the one the row actually holds, never one the
  // browser guessed. Somebody tapping a board wants to see what got written,
  // and a device with a drifting clock would otherwise confirm a lie.
  let at: string;
  let alreadyIn = false;

  if (existing) {
    at = existing.checked_in_at as string;
    if (!existing.checked_out_at && !stampedAt) {
      alreadyIn = true;
    } else {
      // Reopening the day, correcting the arrival, or both. A stated time wins
      // over what is already recorded — that is the point of typing it.
      const patch: Record<string, unknown> = {
        checked_out_at: null,
        recorded_by: actorId ?? null,
        updated_at: new Date().toISOString(),
      };
      if (stampedAt) { patch.checked_in_at = stampedAt; at = stampedAt; }
      const { error } = await supabaseAdmin
        .from('attendance').update(patch)
        .eq('id', existing.id).eq('organization_id', orgId);
      if (error) { console.error('Failed to record check-in:', error); throw new Error('Failed to check in'); }
    }
  } else {
    const { data: created, error } = await supabaseAdmin.from('attendance').insert({
      organization_id: orgId,
      employee_id: employeeId,
      work_date: workDate,
      recorded_by: actorId ?? null,
      // Stamped here rather than left to the column default, so arrival and
      // departure are told by the same clock. Letting the database fire now()
      // for one and not the other makes leaving refuse itself whenever the two
      // clocks differ by more than the walk to the door.
      checked_in_at: stampedAt ?? new Date().toISOString(),
    }).select('checked_in_at').single();
    if (error || !created) { console.error('Failed to check in:', error); throw new Error('Failed to check in'); }
    at = created.checked_in_at as string;
  }

  await logEvent({
    organizationId: orgId, entityType: 'employee', entityId: employeeId,
    action: 'checked_in', actorId: actorId ?? undefined, payload: { workDate },
  });
  revalidatePath('/attendance');
  revalidatePath('/team');
  return { ok: true, alreadyIn, at, workDate };
}

/** Left for the day. Nothing to stamp if they were never in — say so rather than inventing a morning. */
export async function checkOut(employeeId: string, atLocalTime?: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { workDate, timezone } = await studioToday(orgId);

  const { data: existing } = await supabaseAdmin
    .from('attendance')
    .select('id, checked_in_at')
    .eq('organization_id', orgId)
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .maybeSingle();

  if (!existing) throw new Error('They haven’t checked in today.');

  const leftAt = atLocalTime
    ? await instantFor(workDate, atLocalTime, timezone)
    : new Date().toISOString();

  if (new Date(leftAt).getTime() < new Date(existing.checked_in_at as string).getTime()) {
    throw new Error('Check-out cannot be earlier than check-in.');
  }

  const { data: updated, error } = await supabaseAdmin
    .from('attendance')
    .update({ checked_out_at: leftAt, recorded_by: actorId ?? null, updated_at: new Date().toISOString() })
    .eq('id', existing.id).eq('organization_id', orgId)
    .select('checked_in_at, checked_out_at')
    .single();
  if (error || !updated) { console.error('Failed to check out:', error); throw new Error('Failed to check out'); }

  await logEvent({
    organizationId: orgId, entityType: 'employee', entityId: employeeId,
    action: 'checked_out', actorId: actorId ?? undefined, payload: { workDate },
  });
  revalidatePath('/attendance');
  revalidatePath('/team');
  return {
    ok: true,
    at: updated.checked_out_at as string,
    since: updated.checked_in_at as string,
    workDate,
  };
}

/**
 * Which days of the week this person normally works.
 *
 * An empty list is a real answer meaning "not stated" — it is stored as such
 * rather than as all seven, so the board never claims someone is off on a day
 * nobody ever spoke about.
 */
export async function setWorkingDays(input: { employeeId: string; days: number[] }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  // Scoping the update alone would silently affect nothing for a foreign
  // employee, and report success. Say so instead.
  await assertOurs(orgId, [{ table: 'employees', id: input.employeeId, label: 'team member' }]);

  const days = [...new Set((input.days || []).map(Number))]
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    .sort((a, b) => a - b);

  const { error } = await supabaseAdmin
    .from('employees')
    .update({ working_days: days, updated_at: new Date().toISOString() })
    .eq('id', input.employeeId)
    .eq('organization_id', orgId);
  if (error) { console.error('Failed to set working days:', error); throw new Error('Failed to save their week'); }

  await logEvent({
    organizationId: orgId, entityType: 'employee', entityId: input.employeeId,
    action: 'working_days_set', actorId: actorId ?? undefined, payload: { days },
  });
  revalidatePath('/attendance');
  revalidatePath('/team');
  revalidatePath(`/team/${input.employeeId}`);
  return { ok: true };
}

/**
 * Correct a recorded time.
 *
 * People forget to check in. Somebody arrives at eight, remembers at ten, and
 * without this the record says ten and the studio has no way to say otherwise.
 * A register that cannot be corrected gets worked around instead of used.
 *
 * Times arrive as wall-clock strings ("08:15") because that is what an operator
 * types and what the record means. Converting to an instant needs the zone's
 * offset on that specific date, so Postgres does it — it carries the full
 * timezone database, and doing it in JavaScript is wrong for one hour twice a
 * year wherever daylight saving applies.
 *
 * Clearing the check-out time is allowed and means they are back in. Clearing
 * the check-in time is not: it is the one thing that makes the record a record.
 */
export async function adjustAttendance(input: {
  attendanceId: string;
  /** "HH:MM" in the studio's timezone. Omit to leave unchanged. */
  checkedInAt?: string;
  /** "HH:MM", or null to reopen the day. Omit to leave unchanged. */
  checkedOutAt?: string | null;
  note?: string | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { timezone } = await studioToday(orgId);

  const { data: existing } = await supabaseAdmin
    .from('attendance')
    .select('id, work_date, checked_in_at, checked_out_at')
    .eq('id', input.attendanceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!existing) throw new Error('That attendance record no longer exists.');

  // Resolved against the record's OWN working day, so correcting a past
  // Tuesday uses that Tuesday's offset rather than today's.
  const toInstant = (wallClock: string) => localInstant(existing.work_date, wallClock, timezone);

  const patch: Record<string, unknown> = {
    recorded_by: actorId ?? null,
    updated_at: new Date().toISOString(),
  };

  if (input.checkedInAt !== undefined) {
    if (!input.checkedInAt) throw new Error('A record needs a check-in time.');
    patch.checked_in_at = await toInstant(input.checkedInAt);
  }
  if (input.checkedOutAt !== undefined) {
    patch.checked_out_at = input.checkedOutAt ? await toInstant(input.checkedOutAt) : null;
  }
  if (input.note !== undefined) patch.note = (input.note || '').trim() || null;

  // Checked against the values as they will be AFTER this change, not as they
  // were, so correcting both ends in one go is judged on the result.
  const nextIn = (patch.checked_in_at as string) ?? existing.checked_in_at;
  const nextOut = patch.checked_out_at === null
    ? null
    : ((patch.checked_out_at as string) ?? existing.checked_out_at);
  if (nextOut && new Date(nextOut).getTime() < new Date(nextIn).getTime()) {
    throw new Error('Check-out cannot be earlier than check-in.');
  }

  const { data: saved, error } = await supabaseAdmin
    .from('attendance')
    .update(patch)
    .eq('id', input.attendanceId)
    .eq('organization_id', orgId)
    .select('checked_in_at, checked_out_at')
    .single();
  if (error || !saved) { console.error('Failed to adjust attendance:', error); throw new Error('Failed to save the change'); }

  // Logged as an edit, with what it was, because a corrected time that leaves
  // no trace of the correction is worth less than an uncorrected one.
  await logEvent({
    organizationId: orgId,
    entityType: 'attendance',
    entityId: input.attendanceId,
    action: 'adjusted',
    actorId: actorId ?? undefined,
    payload: {
      workDate: existing.work_date,
      from: { checkedInAt: existing.checked_in_at, checkedOutAt: existing.checked_out_at },
      to: { checkedInAt: saved.checked_in_at, checkedOutAt: saved.checked_out_at },
    },
  });

  revalidatePath('/attendance');
  revalidatePath('/team');
  return { ok: true, at: saved.checked_in_at as string, out: (saved.checked_out_at ?? null) as string | null };
}

/**
 * One person's recent days — the profile's "has this person been in" question.
 *
 * The operator comes back with it. A shared device means anyone can tap any
 * name, and a time nobody is accountable for is a time nobody trusts; the whole
 * argument for not building a login for crew was that the row carries who
 * entered it. It was carried and never shown, which is the same as not carrying
 * it. `recordedBy` is whoever touched the row last — the event log holds the
 * full chain when the question is who did what in what order.
 */
export async function listAttendanceForEmployee(employeeId: string, limit = 30) {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('attendance')
    .select('id, work_date, checked_in_at, checked_out_at, operator:contacts!attendance_recorded_by_fkey(display_name)')
    .eq('organization_id', orgId)
    .eq('employee_id', employeeId)
    .order('work_date', { ascending: false })
    .limit(limit);

  // Said out loud rather than returned as an empty history. A join that stops
  // resolving would otherwise look exactly like a person who has never been in.
  if (error) console.error('Failed to load attendance history:', error);

  return ((data || []) as any[]).map((a) => ({
    id: a.id as string,
    workDate: a.work_date as string,
    checkedInAt: a.checked_in_at as string,
    checkedOutAt: (a.checked_out_at ?? null) as string | null,
    /** Who last recorded or corrected this day. Null on records from before it was kept. */
    recordedBy: (a.operator?.display_name ?? null) as string | null,
    /** Minutes between arriving and leaving, once they have left. */
    minutes: a.checked_out_at
      ? Math.max(0, Math.round((new Date(a.checked_out_at).getTime() - new Date(a.checked_in_at).getTime()) / 60000))
      : null,
  }));
}

/**
 * The studio's usual hours — the answer for any day the week does not cover.
 *
 * Beneath the weekly schedule and everything that overrides it. A studio that
 * fills in only this gets one set of hours every day, which is a real and
 * common answer; a studio that describes its week never reaches this.
 *
 * Clearable, and clearing is itself an answer: with no opening time there is
 * no line to be late against, and the board stops claiming there is. Stored as
 * wall clock because opening is the same hour whatever the offset that day.
 */
export async function setStudioDefaultHours(input: {
  opensAt?: string | null;
  closesAt?: string | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const opensAt = (input.opensAt || '').trim() || null;
  const closesAt = (input.closesAt || '').trim() || null;
  if (opensAt && !TIME.test(opensAt)) throw new Error('Give the opening time as 08:30.');
  if (closesAt && !TIME.test(closesAt)) throw new Error('Give the closing time as 17:00.');
  // Closing without opening describes a studio that shut without opening.
  if (closesAt && !opensAt) throw new Error('Say when the studio opens before saying when it closes.');

  const { error } = await supabaseAdmin
    .from('organizations').update({ opens_at: opensAt, closes_at: closesAt }).eq('id', orgId);
  if (error) {
    console.error('Failed to set the studio hours:', error);
    throw new Error('Failed to save the hours');
  }

  await logEvent({
    organizationId: orgId, entityType: 'organization', entityId: orgId,
    action: 'default_hours_set', actorId: actorId ?? undefined, payload: { opensAt, closesAt },
  });
  revalidatePath('/attendance');
  revalidatePath('/settings');
  return { ok: true };
}

/** The studio's own timezone — what decides where one working day ends. */
export async function setStudioTimezone(timezone: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const clean = (timezone || '').trim();
  if (!clean) throw new Error('Give the studio a timezone.');
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: clean });
  } catch {
    throw new Error(`${clean} isn’t a timezone this system recognises.`);
  }

  const { error } = await supabaseAdmin
    .from('organizations').update({ timezone: clean }).eq('id', orgId);
  if (error) { console.error('Failed to set timezone:', error); throw new Error('Failed to save the timezone'); }

  await logEvent({
    organizationId: orgId, entityType: 'organization', entityId: orgId,
    action: 'timezone_set', actorId: actorId ?? undefined, payload: { timezone: clean },
  });
  revalidatePath('/attendance');
  revalidatePath('/settings');
  return { ok: true };
}
