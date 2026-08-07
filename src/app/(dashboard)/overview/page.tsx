import Link from 'next/link';
import { stageBadgeClass } from '@/components/stageBadge';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudio } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { listRecentActivity } from '@/kernel/events';
import { listBookings, listBookingsInRange } from '@/modules/bookings/interface';
import { listTransactions } from '@/modules/finances/interface';
import { listServices } from '@/modules/services/interface';
import { listPackages } from '@/modules/packages/interface';

export const dynamic = 'force-dynamic';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The Command Center is a VIEW, not a module: it owns no data and queries no
 * tables. Every figure here is asked of whichever module owns it — the same
 * discipline the Calendar already follows — so this page can't drift from
 * what those modules mean by "open booking" or "pending".
 */
async function getOverviewData() {
  try {
    await getAuthOrgId();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const [org, recentEvents, allBookings, transactions, todaysShoots, services, packages] = await Promise.all([
      getStudio(),
      listRecentActivity(8),
      listBookings(),
      listTransactions(),
      listBookingsInRange(todayStart, todayEnd),
      listServices(),
      listPackages(),
    ]);
    if (!org) return null;

    // "Open" is a stage KIND, never a stage name — a studio can call its
    // stages anything, so matching on names would break the moment they do.
    const openBookings = allBookings
      .filter((b) => b.stage?.kind === 'enquiry' || b.stage?.kind === 'booked')
      .slice(0, 6);

    const pendingPayments = (transactions as any[]).filter((t) => t.status === 'pending').slice(0, 5);

    return {
      org,
      recentEvents,
      openBookings,
      pendingPayments,
      todaysShoots,
      onboarding: {
        hasService: services.length > 0,
        hasPackage: (packages as any[]).length > 0,
      },
    };
  } catch (err: any) {
    return { fatalError: err.message || 'Unknown error' };
  }
}

export default async function OverviewPage() {
  const data = await getOverviewData();

  if (data && 'fatalError' in data) {
    return (
      <div className="q-note q-note-bad">
        <h1>FATAL ERROR</h1>
        <p>{data.fatalError}</p>
      </div>
    );
  }
  if (!data) return null;

  const { org, recentEvents, openBookings, pendingPayments, todaysShoots, onboarding } = data;
  const isOnboarding = !onboarding.hasService || !onboarding.hasPackage;

  const CheckItem = ({ done, label, sub, href }: { done: boolean; label: string; sub: string; href: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: done ? 'color-mix(in srgb, var(--q-color-success) 10%, transparent)' : 'var(--q-color-ink-50)', border: `1px solid ${done ? 'color-mix(in srgb, var(--q-color-success) 28%, transparent)' : 'var(--q-color-ink-200)'}`, borderRadius: '10px' }}>
      <div style={{ width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0, background: done ? 'var(--q-color-success)' : 'var(--q-color-ink-300)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>
        {done ? '✓' : ''}
      </div>
      <div className="q-fill">
        <div className="q-strong" style={{ opacity: done ? 0.6 : 1 }}>{label}</div>
        <div className="q-meta">{sub}</div>
      </div>
      {!done && <Link href={href} className="q-btn q-btn-secondary q-btn-sm">Go →</Link>}
    </div>
  );

  return (
    <div>
      <header className="q-page-header q-row q-row-between">
        <div>
          <h1 className="q-page-title">Command Center</h1>
          <p className="q-page-subtitle">{greeting()}. Here is what needs your attention.</p>
        </div>
        <Link href="/bookings/new" className="q-btn q-btn-primary">+ New booking</Link>
      </header>

      {/* Setup checklist — shown until the studio has at least one service and one package */}
      {isOnboarding && (
        <div className="q-card" style={{ maxWidth: '580px', marginBottom: '40px' }}>
          <h2 className="q-section-title" style={{ marginBottom: '20px' }}>Get started</h2>
          <div className="q-stack q-stack-sm">
            <CheckItem
              done={onboarding.hasService}
              label="Define your first service"
              sub="A service is what your studio actually does — the operational unit."
              href="/services/new"
            />
            <CheckItem
              done={onboarding.hasPackage}
              label="Create a package to sell it"
              sub="A package bundles one or more services into something a client can book."
              href="/packages/new"
            />
          </div>
          {onboarding.hasService && onboarding.hasPackage && org.slug && (
            <div className="q-meta" style={{ marginTop: '16px' }}>
              Your storefront is live at{' '}
              <Link href={`/book/${org.slug}`} className="q-accent">/book/{org.slug}</Link>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>

        {/* Main column */}
        <div className="q-stack q-stack-lg">

          {/* Today's shoots — only shown when there's something on the calendar */}
          {todaysShoots.length > 0 && (
            <div className="q-card">
              <h2 className="q-section-title">Today</h2>
              <div className="q-stack q-stack-sm">
                {todaysShoots.map((b) => (
                  <Link key={b.bookingId} href={`/bookings/${b.bookingId}`} className="q-tile q-row q-row-between q-plain-link">
                    <div>
                      <strong className="q-strong">{b.title}</strong>
                      {b.client && <div className="q-meta">{b.client}</div>}
                    </div>
                    <span className="q-num q-meta-plain">{fmtTime(b.at)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Pending payments — action required */}
          <div className="q-card">
            <h2 className="q-section-title">Pending payments</h2>
            {pendingPayments.length === 0 ? (
              <p className="q-empty">No payments waiting.</p>
            ) : (
              <div className="q-stack q-stack-sm">
                {pendingPayments.map((tx: any) => (
                  <Link
                    key={tx.id}
                    href={tx.booking?.id ? `/bookings/${tx.booking.id}` : '/finances'}
                    className="q-tile q-row q-row-between q-plain-link"
                    style={{ borderLeft: '3px solid var(--q-color-warm)' }}
                  >
                    <div>
                      <strong className="q-strong">{tx.booking?.title || tx.contact?.display_name || 'Client'}</strong>
                      {tx.contact?.display_name && tx.booking?.title && (
                        <div className="q-meta">{tx.contact.display_name}</div>
                      )}
                    </div>
                    <span className="q-strong q-num q-warm">{formatMoney(tx.amount, tx.currency)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Open bookings */}
          <div className="q-card">
            <div className="q-row q-row-between" style={{ marginBottom: '12px' }}>
              <h2 className="q-section-title" style={{ margin: 0 }}>Open bookings</h2>
              <Link href="/bookings" className="q-meta q-accent">See all →</Link>
            </div>
            {openBookings.length === 0 ? (
              <p className="q-empty">No open bookings.</p>
            ) : (
              <div className="q-stack q-stack-sm">
                {openBookings.map((b) => (
                  <Link key={b.id} href={`/bookings/${b.id}`} className="q-tile q-row q-row-between q-plain-link">
                    <div>
                      <strong className="q-strong">{b.title}</strong>
                      {b.clientName && <div className="q-meta">{b.clientName}</div>}
                    </div>
                    <span className={`q-badge ${stageBadgeClass(b.stage)}`}>{b.stage?.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Activity feed sidebar */}
        <div className="q-card" style={{ position: 'sticky', top: '24px' }}>
          <h2 className="q-section-title">Activity</h2>
          {recentEvents.length === 0 ? (
            <p className="q-empty">Nothing yet.</p>
          ) : (
            <div className="q-stack q-stack-md">
              {recentEvents.map((evt) => (
                <div key={evt.id} className="q-meta-plain">
                  <div>{evt.description}</div>
                  <div className="q-meta">
                    {new Date(evt.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
