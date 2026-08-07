import Link from 'next/link';
import { stageBadgeClass } from '@/components/stageBadge';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { formatMoney } from '@/kernel/currency';

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

function describeEvent(evt: any): string {
  const who = evt.person?.display_name || 'System';
  const type = evt.entity_type as string;
  const action = evt.action as string;
  const key = `${type}.${action}`;
  const map: Record<string, string> = {
    'booking.created':              `${who} created a booking`,
    'booking.stage_changed':        `${who} moved a booking`,
    'booking.updated':              `${who} updated a booking`,
    'booking_line.created':         `${who} added a package to a booking`,
    'client.created':               `${who} added a client`,
    'client.archived':              `${who} archived a client`,
    'contract.created':             `${who} drafted a contract`,
    'contract.activated':           `${who} activated a contract`,
    'contract.cancelled':           `${who} cancelled a contract`,
    'financial_transaction.created': `${who} raised an invoice`,
    'financial_transaction.settled': `${who} settled a payment`,
    'task.completed':               `${who} completed a task`,
    'delivery.created':             `${who} created a delivery bundle`,
    'delivery.shared':              `${who} shared a delivery`,
    'package.created':              `${who} created a package`,
    'package.retired':              `${who} retired a package`,
    'service.created':              `${who} added a service`,
    'employee.created':             `${who} added a team member`,
    'employee.archived':            `${who} archived a team member`,
  };
  return map[key] ?? `${who} ${action.replace(/_/g, ' ')} ${type.replace(/_/g, ' ')}`;
}

async function getOverviewData() {
  try {
    const { orgId } = await getAuthOrgId();

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, name, slug')
      .eq('id', orgId)
      .single();
    if (!org) return null;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const [
      { data: recentEvents },
      { data: openBookings },
      { data: pendingPayments },
      { data: todaysShoots },
      { count: serviceCount },
      { count: packageCount },
    ] = await Promise.all([
      supabaseAdmin
        .from('events')
        .select('entity_type, action, created_at, person:contacts(display_name)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(8),
      supabaseAdmin
        .from('bookings')
        .select('id, title, stage:booking_stages!inner(name, kind, color), contact:contacts(display_name)')
        .eq('organization_id', orgId)
        .in('stage.kind', ['enquiry', 'booked'])
        .order('created_at', { ascending: false })
        .limit(6),
      supabaseAdmin
        .from('financial_transactions')
        .select('id, amount, currency, booking:bookings(id, title), contact:contacts(display_name)')
        .eq('organization_id', orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('bookings')
        .select('id, title, scheduled_for, contact:contacts(display_name)')
        .eq('organization_id', orgId)
        .gte('scheduled_for', todayStart)
        .lt('scheduled_for', todayEnd)
        .order('scheduled_for'),
      supabaseAdmin
        .from('services')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId),
      supabaseAdmin
        .from('packages')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId),
    ]);

    return {
      org,
      recentEvents:    recentEvents    || [],
      openBookings:    openBookings    || [],
      pendingPayments: pendingPayments || [],
      todaysShoots:    todaysShoots    || [],
      onboarding: {
        hasService: (serviceCount || 0) > 0,
        hasPackage: (packageCount || 0) > 0,
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
                {todaysShoots.map((b: any) => (
                  <Link key={b.id} href={`/bookings/${b.id}`} className="q-tile q-row q-row-between q-plain-link">
                    <div>
                      <strong className="q-strong">{b.title}</strong>
                      {b.contact?.display_name && <div className="q-meta">{b.contact.display_name}</div>}
                    </div>
                    <span className="q-num q-meta-plain">{fmtTime(b.scheduled_for)}</span>
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
                {openBookings.map((b: any) => (
                  <Link key={b.id} href={`/bookings/${b.id}`} className="q-tile q-row q-row-between q-plain-link">
                    <div>
                      <strong className="q-strong">{b.title}</strong>
                      {b.contact?.display_name && <div className="q-meta">{b.contact.display_name}</div>}
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
              {recentEvents.map((evt: any, i: number) => (
                <div key={i} style={{ fontSize: '0.85rem' }}>
                  <div style={{ color: 'var(--q-color-ink-700)' }}>{describeEvent(evt)}</div>
                  <div className="q-meta">{new Date(evt.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
