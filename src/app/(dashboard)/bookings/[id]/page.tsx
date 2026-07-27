import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { AddLineForm } from './AddLineForm';

export const dynamic = 'force-dynamic';

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };
function money(amount: number, currency = 'USD') {
  return `${CURRENCY_SYMBOL[currency] || ''}${Number(amount || 0).toLocaleString()} ${currency}`;
}
function linePrice(price: any) {
  const base = price?.base_price;
  if (base == null) return '—';
  return money(base, price?.currency || 'USD');
}

const STATUS_BADGE: Record<string, string> = { active: 'q-badge-success', draft: 'q-badge-neutral', closed: 'q-badge-neutral', cancelled: 'q-badge-danger' };

export default async function BookingDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { orgId } = await getAuthOrgId();

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select(`
      id, title, status, scheduled_for, created_at,
      person:persons(id, display_name, email),
      booking_lines(id, title, price, service_template_id, status),
      contracts(id, version, status),
      financial_transactions(id, type, amount, currency, status),
      workflows(id, status, booking_line_id)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!booking) notFound();

  const { data: services } = await supabaseAdmin
    .from('service_templates')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('name');

  const lines: any[] = booking.booking_lines || [];
  const workflows: any[] = booking.workflows || [];
  const contracts: any[] = booking.contracts || [];
  const txns: any[] = booking.financial_transactions || [];
  const wfForLine = (lineId: string) => workflows.find((w) => w.booking_line_id === lineId);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="q-card" style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '1.05rem', marginTop: 0, marginBottom: '16px', fontWeight: 600 }}>{title}</h2>
      {children}
    </div>
  );

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header">
        <div style={{ marginBottom: '16px' }}>
          <Link href="/bookings" style={{ color: 'var(--q-color-ink-500)', textDecoration: 'none', fontSize: '0.875rem' }}>&larr; Back to Bookings</Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h1 className="q-page-title" style={{ marginBottom: '4px' }}>{booking.title}</h1>
            <p className="q-page-subtitle" style={{ margin: 0 }}>{booking.person?.display_name || 'No client yet'}</p>
          </div>
          <span className={`q-badge ${STATUS_BADGE[booking.status] || 'q-badge-neutral'}`}>{booking.status.toUpperCase()}</span>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Services (lines) */}
        <Section title="Services">
          {lines.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)' }}>No services yet — add one, or leave it and fill in later.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {lines.map((l) => {
                const wf = wfForLine(l.id);
                return (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '2px' }}>{l.title}</strong>
                      <span style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-500)' }}>{linePrice(l.price)}</span>
                    </div>
                    {wf ? (
                      <Link href={`/workflows/${wf.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.85rem' }}>
                        <Play size={14} style={{ marginRight: '6px' }} /> {wf.status}
                      </Link>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-400)' }}>no workflow</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <AddLineForm bookingId={booking.id} services={services || []} />
        </Section>

        {/* Contract */}
        <Section title="Contract">
          {contracts.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)' }}>No contract yet — this booking runs fine without one. Add terms whenever you're ready.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {contracts.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                  <div><strong>Contract v{c.version}</strong> <span className={`q-badge ${c.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`} style={{ marginLeft: '8px' }}>{c.status}</span></div>
                  <Link href={`/contracts/${c.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.85rem' }}>Open</Link>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Money */}
        <Section title="Invoices & Payments">
          {txns.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)' }}>No money on this booking yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {txns.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                  <div>
                    <strong style={{ textTransform: 'capitalize' }}>{String(t.type).replace(/_/g, ' ')}</strong>
                    <span className={`q-badge ${t.status === 'settled' ? 'q-badge-success' : 'q-badge-warning'}`} style={{ marginLeft: '8px' }}>{t.status}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontWeight: 600 }}>{money(t.amount, t.currency)}</span>
                    <Link href={`/finances/${t.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.85rem' }}>Open</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

      </div>
    </div>
  );
}
