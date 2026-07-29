import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { NewBookingForm } from './NewBookingForm';
import { stageBadgeClass } from '@/components/stageBadge';

export const dynamic = 'force-dynamic';


export default async function BookingsPage() {
  let orgId: string;
  try {
    orgId = (await getAuthOrgId()).orgId;
  } catch {
    redirect('/login');
  }

  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select(`
      id, title, created_at,
      stage:booking_stages(name, kind),
      person:contacts(display_name),
      booking_lines(id),
      contracts(id, status),
      financial_transactions(id, amount, status)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="q-page-title">Bookings</h1>
          <p className="q-page-subtitle">Every job, wherever it is. A booking can start from just a title and grow.</p>
        </div>
        <div className="q-row">
          <Link href="/bookings/settings" className="q-btn q-btn-secondary">Settings</Link>
          <NewBookingForm />
        </div>
      </header>

      {(!bookings || bookings.length === 0) ? (
        <div className="q-card" style={{ textAlign: 'center', padding: 'clamp(44px, 7vw, 76px) 24px', color: 'var(--q-color-ink-500)' }}>
          No bookings yet. Start one from just a title — add the details as they come.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {bookings.map((b: any) => {
            const lineCount = b.booking_lines?.length || 0;
            const hasContract = (b.contracts?.length || 0) > 0;
            const pending = (b.financial_transactions || []).filter((t: any) => t.status === 'pending');
            const pendingTotal = pending.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
            return (
              <Link
                key={b.id}
                href={`/bookings/${b.id}`}
                className="q-card q-card-interactive q-plain-link q-stack"
                style={{ gap: '14px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div>
                    <h3 className="q-section-title">{b.title}</h3>
                    <div className="q-meta">{b.person?.display_name || 'No client yet'}</div>
                  </div>
                  <span className={`q-badge ${stageBadgeClass(b.stage?.kind)}`}>{b.stage?.name}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: 'auto' }}>
                  <span className="q-badge q-badge-neutral">{lineCount} {lineCount === 1 ? 'service' : 'services'}</span>
                  {hasContract && <span className="q-badge q-badge-neutral">contract</span>}
                  {pendingTotal > 0 && <span className="q-badge q-badge-warning">${pendingTotal.toLocaleString()} due</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
