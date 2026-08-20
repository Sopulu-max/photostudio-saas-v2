import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * When a studio is open, and what a wall-clock time means there.
 *
 * IN THE KERNEL, NOT IN A MODULE. These began inside Team, because attendance
 * was the first thing that needed them, and that was only ever true of the
 * order they were built in. A studio's hours are a fact about the studio, and
 * at least two modules read them for unrelated reasons: attendance asks whether
 * an arrival was late, bookings asks whether a client may be offered a slot.
 * Either could have imported from the other; both importing from here is the
 * only arrangement that does not make one module's meaning depend on another's.
 *
 * READS ONLY. Setting the hours is a settings surface and its actions live
 * beside the rest of the studio's configuration; every module that merely wants
 * to know an answer comes here.
 */

export type StudioDayHours = {
  /** "08:30", or null when the studio has said nothing about this day. */
  opensAt: string | null;
  /** "17:00", or null. Recorded and shown; never used to judge anyone. */
  closesAt: string | null;
  /** The studio does not open at all. */
  closed: boolean;
  /** Why this day differs — "Sanitation", "Christmas Day". Null on an ordinary day. */
  label: string | null;
};

/**
 * The hours this studio keeps on this date, and why.
 *
 * Resolved in Postgres because the question is calendar arithmetic — which
 * occurrence of a weekday a date is, whether the month has run out — and
 * because the precedence between a named date, an nth weekday, the ordinary
 * week and the studio's usual hours is written there once.
 */
export async function studioHoursFor(orgId: string, date: string): Promise<StudioDayHours> {
  const { data, error } = await supabaseAdmin
    .rpc('studio_hours_for', { p_org: orgId, p_date: date });
  if (error) console.error('Failed to resolve the studio hours:', error);

  // A set-returning function comes back as an array of one.
  const row = (Array.isArray(data) ? data[0] : data) as
    { opens_at: string | null; closes_at: string | null; closed: boolean; label: string | null } | undefined;

  return {
    // "08:30:00" from Postgres; every caller wants "08:30".
    opensAt: row?.opens_at ? row.opens_at.slice(0, 5) : null,
    closesAt: row?.closes_at ? row.closes_at.slice(0, 5) : null,
    closed: !!row?.closed,
    label: row?.label ?? null,
  };
}

/**
 * A wall-clock time on a date, in a zone, as an instant.
 *
 * Postgres does it because it carries the timezone database and knows the
 * offset that applied on THAT date. The same conversion in JavaScript uses
 * today's offset, which is wrong for an hour twice a year wherever daylight
 * saving applies — and wrong all year round if the code runs on a machine in a
 * different zone from the studio, which on a server it always does.
 */
export async function localInstant(date: string, wallClock: string, timezone: string): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('studio_local_instant', {
    p_date: date, p_time: wallClock, p_timezone: timezone,
  });
  if (error || !data) {
    console.error('Failed to resolve a local time:', error);
    throw new Error(`${wallClock} is not a valid time.`);
  }
  return data as string;
}

/** The studio's own timezone. UTC when it has never said. */
export async function studioTimezone(orgId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('organizations').select('timezone').eq('id', orgId).maybeSingle();
  return (data?.timezone as string) || 'UTC';
}
