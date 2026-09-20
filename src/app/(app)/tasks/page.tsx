import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listWorkSheet } from '@/modules/production/interface';
import { WorkPositions } from '@/components/WorkPositions';
import { initialsFor } from '@/components/Sheet';
import { stageBadgeClass } from '@/components/stageBadge';

export const dynamic = 'force-dynamic';

/**
 * THE WORK, GLOBALLY.
 *
 * Every live job the studio holds, with where it stands: its stage (the
 * global position) and, inside it, each package's services and where each one
 * is (the local positions). A booking with photo and video shows both, so
 * "video done, photo in edit" is read here without opening the booking.
 * Nothing on this page is stored anywhere; it is the tasks, read.
 *
 * This replaced a "coming soon" card that promised a label-based system the
 * schema had already moved on from.
 */
export default async function TasksPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const rows = await listWorkSheet();
  const withWork = rows.filter((r) => r.work.total > 0);
  const without = rows.filter((r) => r.work.total === 0);
  const say = (d: string | null) => d
    ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : null;

  return (
    <div className="q-page">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Work</h1>
          <p className="q-page-subtitle">Every live job, and where each part of it stands.</p>
        </div>
      </header>

      {rows.length === 0 && <p className="q-empty">No live bookings.</p>}

      {withWork.length > 0 && (
        <div className="q-sheet">
          {withWork.map((r) => (
            <div key={r.bookingId} className="q-sheet-row">
              <span className="q-sheet-frame" aria-hidden="true">{initialsFor(r.clientName ?? r.title)}</span>
              <span className="q-sheet-body">
                <span className="q-row q-row-sm" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Link href={`/bookings/${r.bookingId}`} className="q-sheet-name q-plain-link">{r.title}</Link>
                  {r.stage && <span className={`q-badge ${stageBadgeClass(r.stage as any)}`}>{r.stage.name}</span>}
                  {say(r.scheduledFor) && <span className="q-meta-sm">{say(r.scheduledFor)}</span>}
                </span>
                <WorkPositions work={r.work} compact />
              </span>
              <span className="q-sheet-side">
                <span className={r.work.allDone ? 'q-sheet-fig' : 'q-sheet-fig q-sheet-fig-none'}>
                  {r.work.allDone ? 'All done' : `${r.work.done} of ${r.work.total}`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {without.length > 0 && (
        <section className={withWork.length > 0 ? 'q-section-gap' : undefined}>
          <h2 className="q-section-title">No work yet</h2>
          <p className="q-meta" style={{ marginBottom: '12px' }}>Live bookings whose packages define no tasks, or that have none yet.</p>
          <div className="q-sheet">
            {without.map((r) => (
              <div key={r.bookingId} className="q-sheet-row q-sheet-row-dim">
                <span className="q-sheet-frame" aria-hidden="true">{initialsFor(r.clientName ?? r.title)}</span>
                <span className="q-sheet-body">
                  <span className="q-row q-row-sm" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <Link href={`/bookings/${r.bookingId}`} className="q-sheet-name q-plain-link">{r.title}</Link>
                    {r.stage && <span className={`q-badge ${stageBadgeClass(r.stage as any)}`}>{r.stage.name}</span>}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
