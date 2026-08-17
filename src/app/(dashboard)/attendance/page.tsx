import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getAttendanceToday } from '@/modules/team/interface';
import { AttendanceBoard } from './AttendanceBoard';

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

  const { workDate, timezone, roster } = await getAttendanceToday();
  const here = roster.filter((r) => r.state === 'in').length;

  return (
    <div className="q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Attendance</h1>
          <p className="q-page-subtitle">
            {here === 0
              ? 'Nobody has checked in yet today.'
              : `${here} ${here === 1 ? 'person is' : 'people are'} in right now.`}
          </p>
        </div>
        <Link href="/team" className="q-btn q-btn-secondary">Team</Link>
      </header>

      {timezone === 'UTC' && (
        <p className="q-note" style={{ marginBottom: '16px' }}>
          This studio has no timezone set, so a working day runs on UTC. If your evenings start landing
          on the next day, set it in <Link className="q-accent" href="/settings">Settings</Link>.
        </p>
      )}

      <AttendanceBoard roster={roster} workDate={workDate} timezone={timezone} />
    </div>
  );
}
