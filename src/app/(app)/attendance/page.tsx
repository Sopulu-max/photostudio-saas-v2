import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getAttendanceToday } from '@/modules/team/interface';
import { AttendanceBoard } from './AttendanceBoard';
import { StudioClock } from './StudioClock';

export const dynamic = 'force-dynamic';

/**
 * The register, for a shared device by the door.
 *
 * Nobody signs in here — the studio's device is signed in, and whoever taps is
 * recorded on the row. That is what let this ship without a permission system:
 * crew have no accounts, and giving them one would currently hand them the
 * finances too.
 *
 * The day it belongs to is the studio's day, not the server's. If a studio's
 * evenings look like they land on tomorrow, its timezone is still UTC — the
 * banner says so, because a register quietly filing work on the wrong date is
 * worse than one that admits it doesn't know where it is.
 */
export default async function AttendancePage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const { workDate, timezone, isoWeekday, opensAt, closesAt, closed, openingLabel, roster } = await getAttendanceToday();
  const here = roster.filter((r) => r.state === 'in').length;
  // Only people whose day it is. Counting someone's day off as "still to come"
  // is how a register turns into a list of false alarms.
  const stillDue = roster.filter((r) => r.state === 'away').length;

  return (
    <div className="q-page-narrow">
      <header className="q-page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          {/* The clock leads: on a device at the entrance the time is what
              people look up, and it confirms what is about to be recorded. */}
          <StudioClock timezone={timezone} />
          {/* The sentence that used to live here counted the room in prose.
              The board now counts it in figures, and saying both would be the
              same fact twice in two shapes. */}
          {roster.length > 0 && here === 0 && stillDue === 0 && (
            <p className="q-page-subtitle" style={{ marginTop: '8px' }}>
              Nobody is scheduled today.
            </p>
          )}
        </div>
        <Link href="/team" className="q-btn q-btn-secondary">Team</Link>
      </header>

      {timezone === 'UTC' && (
        <p className="q-note" style={{ marginBottom: '16px' }}>
          No timezone is set for this studio, so working days are recorded against UTC. Set it in{' '}
          <Link className="q-accent" href="/settings">Settings</Link> for accurate dates.
        </p>
      )}

      <AttendanceBoard
        roster={roster}
        workDate={workDate}
        timezone={timezone}
        isoWeekday={isoWeekday}
        opensAt={opensAt}
        closesAt={closesAt}
        closed={closed}
        openingLabel={openingLabel}
      />
    </div>
  );
}
