import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { stageBadgeClass } from '@/components/stageBadge';
import { listClients } from '@/modules/clients/interface';
import { listPackages } from '@/modules/packages/interface';
import { listBookings } from '@/modules/bookings/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';

export const dynamic = 'force-dynamic';


export default async function BookingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  // Everything here comes through a module interface — this surface owns no queries.
  const [bookings, clientRows, packageRows, currencyCode] = await Promise.all([
    listBookings(), listClients(), listPackages(), getStudioCurrency(),
  ]);
  // Archived clients are not on offer for new work — same rule as retired packages below.
  const clientOptions = clientRows
    .filter((c: any) => c.status !== 'archived')
    .map((c: any) => ({ id: c.contact?.id as string, name: c.contact?.display_name as string }))
    .filter((c: { id: string }) => !!c.id);
  // Retired packages are not on offer for new work.
  const packageOptions = packageRows
    .filter((p: any) => p.status !== 'retired')
    .map((p: any) => ({ id: p.id as string, name: p.name as string }));

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="q-page-title">Bookings</h1>
          <p className="q-page-subtitle">Every job, wherever it is. Start one with whatever you know — the rest fills in as you go.</p>
        </div>
        <div className="q-row">
          <Link href="/bookings/settings" className="q-btn q-btn-secondary">Settings</Link>
          <Link href="/bookings/new" className="q-btn q-btn-primary">+ New booking</Link>
        </div>
      </header>

      {(!bookings || bookings.length === 0) ? (
        <div className="q-card" style={{ textAlign: 'center', padding: 'clamp(44px, 7vw, 76px) 24px', color: 'var(--q-color-ink-500)' }}>
          No bookings yet. Start one from just a title — add the details as they come.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {bookings.map((b) => (
            <Link
              key={b.id}
              href={`/bookings/${b.id}`}
              className="q-card q-card-interactive q-plain-link q-stack"
              style={{ gap: '14px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div>
                  <h3 className="q-section-title">{b.title}</h3>
                  <div className="q-meta">{b.clientName || 'No client yet'}</div>
                </div>
                <span className={`q-badge ${stageBadgeClass(b.stage)}`}>{b.stage?.name}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: 'auto' }}>
                <span className="q-badge q-badge-neutral">{b.lineCount} {b.lineCount === 1 ? 'package' : 'packages'}</span>
                {b.hasContract && <span className="q-badge q-badge-neutral">contract</span>}
                {b.pendingTotal > 0 && (
                  <span className="q-badge q-badge-warning">
                    {formatMoney(b.pendingTotal, b.pendingCurrency ?? currencyCode)} due
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
