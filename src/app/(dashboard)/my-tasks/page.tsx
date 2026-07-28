import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listMyTasks } from '@/modules/production/interface';

export const dynamic = 'force-dynamic';

const BADGE: Record<string, string> = {
  completed: 'q-badge-success',
  in_progress: 'q-badge-warning',
  blocked: 'q-badge-danger',
};

export default async function MyTasksPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  // Actually mine: tasks I'm assigned to, through Production's interface.
  const tasks = await listMyTasks();

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">My Tasks</h1>
        <p className="q-page-subtitle">Work assigned to you, across every booking.</p>
      </header>

      <div style={{ display: 'grid', gap: '12px' }}>
        {tasks.length === 0 ? (
          <div className="q-card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--q-color-ink-500)' }}>
            <CheckCircle2 size={44} color="var(--q-color-ink-300)" style={{ margin: '0 auto 16px' }} />
            Nothing assigned to you right now.
          </div>
        ) : (
          tasks.map((t: any) => (
            <div key={t.taskId} className="q-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1.02rem', marginBottom: '3px' }}>{t.stageName}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-500)' }}>
                  {t.bookingTitle}
                  {t.lineTitle && <> · {t.lineTitle}</>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className={`q-badge ${BADGE[t.status] || 'q-badge-neutral'}`}>{t.status.replace('_', ' ')}</span>
                <Link href={`/bookings/${t.bookingId}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.85rem' }}>
                  Open booking
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
