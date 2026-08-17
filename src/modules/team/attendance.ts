'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';

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
  attendanceId: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  /** in = here now · out = came and left · away = not in today */
  state: 'in' | 'out' | 'away';
};

/**
 * The studio's own today.
 *
 * A working day is a fact about the studio, not about UTC — 9pm in Lagos is
 * still today's shift. Resolved here so every caller agrees on which day it is,
 * and frozen onto the row so a later timezone correction cannot move history.
 */
async function studioToday(orgId: string): Promise<{ workDate: string; timezone: string }> {
  const { data } = await supabaseAdmin
    .from('organizations').select('timezone').eq('id', orgId).maybeSingle();
  const timezone = (data?.timezone as string) || 'UTC';
  // en-CA gives YYYY-MM-DD, which is what a `date` column wants.
  const workDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return { workDate, timezone };
}

/** What today looks like: the whole roster, each with where they stand. */
export async function getAttendanceToday(): Promise<{ workDate: string; timezone: string; roster: AttendanceToday[] }> {
  const { orgId } = await getAuthOrgId();
  const { workDate, timezone } = await studioToday(orgId);

  const { data: employees } = await supabaseAdmin
    .from('employees')
    .select('id, title, status, contact:contacts(display_name), employee_roles(role:roles(id, name))')
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
      return {
        employeeId: e.id as string,
        name: (e.contact?.display_name ?? 'Unnamed') as string,
        title: (e.title ?? null) as string | null,
        roles: (e.employee_roles || []).map((er: any) => er.role).filter((r: any) => r?.id),
        attendanceId: (record?.id ?? null) as string | null,
        checkedInAt: (record?.checked_in_at ?? null) as string | null,
        checkedOutAt: (record?.checked_out_at ?? null) as string | null,
        state: !record ? 'away' : record.checked_out_at ? 'out' : 'in',
      } as AttendanceToday;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { workDate, timezone, roster };
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
    .select('id, checked_out_at')
    .eq('organization_id', orgId)
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .maybeSingle();

  if (existing) {
    if (!existing.checked_out_at) return { ok: true, alreadyIn: true };
    const { error } = await supabaseAdmin
      .from('attendance')
      .update({ checked_out_at: null, updated_at: new Date().toISOString() })
      .eq('id', existing.id).eq('organization_id', orgId);
    if (error) { console.error('Failed to reopen attendance:', error); throw new Error('Failed to check in'); }
  } else {
    const { error } = await supabaseAdmin.from('attendance').insert({
      organization_id: orgId,
      employee_id: employeeId,
      work_date: workDate,
      recorded_by: actorId ?? null,
    });
    if (error) { console.error('Failed to check in:', error); throw new Error('Failed to check in'); }
  }

  await logEvent({
    organizationId: orgId, entityType: 'employee', entityId: employeeId,
    action: 'checked_in', actorId: actorId ?? undefined, payload: { workDate },
  });
  revalidatePath('/attendance');
  revalidatePath('/team');
  return { ok: true, alreadyIn: false };
}

/** Left for the day. Nothing to stamp if they were never in — say so rather than inventing a morning. */
export async function checkOut(employeeId: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { workDate } = await studioToday(orgId);

  const { data: existing } = await supabaseAdmin
    .from('attendance')
    .select('id')
    .eq('organization_id', orgId)
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .maybeSingle();

  if (!existing) throw new Error('They haven’t checked in today.');

  const { error } = await supabaseAdmin
    .from('attendance')
    .update({ checked_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', existing.id).eq('organization_id', orgId);
  if (error) { console.error('Failed to check out:', error); throw new Error('Failed to check out'); }

  await logEvent({
    organizationId: orgId, entityType: 'employee', entityId: employeeId,
    action: 'checked_out', actorId: actorId ?? undefined, payload: { workDate },
  });
  revalidatePath('/attendance');
  revalidatePath('/team');
  return { ok: true };
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
