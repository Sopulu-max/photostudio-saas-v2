import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

/**
 * BOOKINGS - deliberately empty, and to be rebuilt from nothing.
 *
 * Cleared on 22 September 2026 at the operator's instruction. What stood here
 * is in the history, not lost: the strand (4fb3490), the statements (a91ef76),
 * the four readings (c538776) and the board (a1e0e1e) - each with the reason
 * it was wrong in the commit that followed it.
 *
 * WHAT IS STILL STANDING, so the rebuild starts from work rather than from
 * zero: the derivation, which was never the thing at fault.
 *   modules/bookings/sheet.ts       a row, its band, its work, what it needs,
 *                                   its answers, the planes it sits on, and
 *                                   the axes read off the data (lenses).
 *   modules/bookings/dashboard.ts   the absences, the roles the studio is
 *                                   short of, the dated window, what the book
 *                                   has sold, its dimensions, the decision,
 *                                   the pipeline, the period, what changed.
 *   docs/architecture/11 and 12     the information architecture, and what
 *                                   makes a reading readable.
 *
 * WHAT IS NOW UNREFERENCED, and must either be used by the rebuild or deleted
 * rather than left as debris: components/Board.tsx, components/Readings.tsx,
 * modules/bookings/say.ts, this folder's BookingsDayBook.tsx, and the .q-board,
 * .q-card, .q-days, .q-share, .q-counts, .q-trend, .q-job, .q-region and
 * .q-said blocks in globals.css.
 *
 * Nothing is drawn here until it is decided what belongs on the page.
 */
export default async function BookingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Bookings</h1>
        </div>
      </header>
    </div>
  );
}
