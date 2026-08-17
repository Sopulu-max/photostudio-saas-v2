'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
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
  title: string | null;
  roles: { id: string; name: string }[];
  workingDays: number[];
  /** Is today one of their days? False only when they have said, and today isn't. */
  expectedToday: boolean;
  attendanceId: string | null;
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
async function studioToday(orgId: string): Promise<{ workDate: string; timezone: string; isoWeekday: number }> {
  const { data } = await supabaseAdmin
    .from('organizations').select('timezone').eq('id', orgId).maybeSingle();
  const timezone = (data?.timezone as string) || 'UTC';
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

  return { workDate, timezone, isoWeekday };
}

/** What today looks like: the whole roster, each with where they stand. */
export async function getAttendanceToday(): Promise<{
  workDate: string; timezone: string; isoWeekday: number; roster: AttendanceToday[];
}> {
  const { orgId } = await getAuthOrgId();
  const { workDate, timezone, isoWeekday } = await studioToday(orgId);

  const { data: employees } = await supabaseAdmin
    .from('employees')
    .select('id, title, status, working_days, contact:contacts(display_name), employee_roles(role:roles(id, name))')
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
      const expectedToday = workingDays.length === 0 || workingDays.includes(isoWeekday);

      return {
        employeeId: e.id as string,
        name: (e.contact?.display_name ?? 'Unnamed') as string,
        title: (e.title ?? null) as string | null,
        roles: (e.employee_roles || []).map((er: any) => er.role).filter((r: any) => r?.id),
        workingDays,
        expectedToday,
        attendanceId: (record?.id ?? null) as string | null,
        checkedInAt: (record?.checked_in_at ?? null) as string | null,
        checkedOutAt: (record?.checked_out_at ?? null) as string | null,
        state: record
          ? (record.checked_out_at ? 'out' : 'in')
          : (expectedToday ? 'away' : 'off'),
      } as AttendanceToday;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { workDate, timezone, isoWeekday, roster };
}

/**
 * Arrived.
 *
 * Idempotent by the day: a second tap on a morning already recorded changes
 * nothing, and a tap after leaving means they are back — `checked_out_at`
 * clears rather than the arrival being overwritten, so the day keeps the time
 * they actually got in.
 */
export async function checkIn(employeeId: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { workDate } = await studioToday(orgId);

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
    if (!existing.checked_out_at) {
      alreadyIn = true;
    } else {
      const { error } = await supabaseAdmin
        .from('attendance')
        .update({ checked_out_at: null, updated_at: new Date().toISOString() })
        .eq('id', existing.id).eq('organization_id', orgId);
      if (error) { console.error('Failed to reopen attendance:', error); throw new Error('Failed to check in'); }
    }
  } else {
    const { data: created, error } = await supabaseAdmin.from('attendance').insert({
      organization_id: orgId,
      employee_id: employeeId,
      work_date: workDate,
      recorded_by: actorId ?? null,
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
export async function checkOut(employeeId: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { workDate } = await studioToday(orgId);

  const { data: existing } = await supabaseAdmin
    .from('attendance')
    .select('id, checked_in_at')
    .eq('organization_id', orgId)
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .maybeSingle();

  if (!existing) throw new Error('They haven’t checked in today.');

  const { data: updated, error } = await supabaseAdmin
    .from('attendance')
    .update({ checked_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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

  const toInstant = async (wallClock: string) => {
    const { data, error } = await supabaseAdmin.rpc('attendance_local_instant', {
      p_date: existing.work_date,
      p_time: wallClock,
      p_timezone: timezone,
    });
    if (error || !data) {
      console.error('Failed to resolve local time:', error);
      throw new Error(`${wallClock} is not a valid time.`);
    }
    return data as string;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

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

/** One person's recent days — the profile's "has this person been in" question. */
export async function listAttendanceForEmployee(employeeId: string, limit = 30) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('attendance')
    .select('id, work_date, checked_in_at, checked_out_at')
    .eq('organization_id', orgId)
    .eq('employee_id', employeeId)
    .order('work_date', { ascending: false })
    .limit(limit);

  return ((data || []) as any[]).map((a) => ({
    id: a.id as string,
    workDate: a.work_date as string,
    checkedInAt: a.checked_in_at as string,
    checkedOutAt: (a.checked_out_at ?? null) as string | null,
    /** Minutes between arriving and leaving, once they have left. */
    minutes: a.checked_out_at
      ? Math.max(0, Math.round((new Date(a.checked_out_at).getTime() - new Date(a.checked_in_at).getTime()) / 60000))
      : null,
  }));
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
