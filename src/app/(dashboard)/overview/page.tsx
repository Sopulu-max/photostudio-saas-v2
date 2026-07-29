import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

async function getOverviewData() {
  try {
    const { orgId } = await getAuthOrgId();

    const { data: org } = await supabaseAdmin.from('organizations').select('id, name').eq('id', orgId).single();
    if (!org) return null;

    // Fetch actionable data (admin client, scoped by org — same as every other page)
    const [
      { data: recentEvents },
      { data: activeProductions },
      { data: pendingPayments },
      { count: workflowTemplatesCount },
      { count: serviceTemplatesCount }
    ] = await Promise.all([
      supabaseAdmin.from('events').select('*, person:contacts(display_name)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5),
      supabaseAdmin.from('bookings').select('id, title, status, contact:contacts(display_name)').eq('organization_id', orgId).in('status', ['inquiry', 'draft', 'active']).order('created_at', { ascending: false }).limit(5),
      supabaseAdmin.from('financial_transactions').select('*, person:contacts(display_name)').eq('organization_id', orgId).eq('status', 'pending').limit(5),
      supabaseAdmin.from('blueprints').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
      supabaseAdmin.from('services').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
    ]);

    return {
      org,
      recentEvents: recentEvents || [],
      activeProductions: activeProductions || [],
      pendingPayments: pendingPayments || [],
      onboarding: {
        hasWorkflow: (workflowTemplatesCount || 0) > 0,
        hasService: (serviceTemplatesCount || 0) > 0,
      }
    };
  } catch (err: any) {
    return { fatalError: err.message || 'Unknown error getting overview data' };
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

  const isOnboarding = !data.onboarding.hasWorkflow || !data.onboarding.hasService;

  return (
    <div>
      <header className="q-page-header q-row q-row-between">
        <div>
          <h1 className="q-page-title">Command Center</h1>
          <p className="q-page-subtitle">Good morning. Here is what needs your attention.</p>
        </div>
        <Link href="/bookings" className="q-btn q-btn-primary">
          + New booking
        </Link>
      </header>
      
      {isOnboarding && (
        <div className="q-card" style={{ maxWidth: '600px', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: '24px' }}>Setup Checklist</h2>
          <div className="q-stack q-stack-md">
            {/* Step 1 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: data.onboarding.hasWorkflow ? 'color-mix(in srgb, var(--q-color-success) 12%, transparent)' : 'var(--q-color-ink-50)', border: `1px solid ${data.onboarding.hasWorkflow ? 'color-mix(in srgb, var(--q-color-success) 32%, transparent)' : 'var(--q-color-ink-200)'}`, borderRadius: '10px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, background: data.onboarding.hasWorkflow ? 'var(--q-color-success)' : 'var(--q-color-ink-300)', color: 'var(--q-color-paper-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>✓</div>
              <div className="q-fill">
                <h3 className="q-muted">Create a blueprint</h3>
                <p className="q-meta">Define the pipeline of tasks that happen after booking.</p>
              </div>
              {!data.onboarding.hasWorkflow && <Link href="/services" className="q-btn q-btn-secondary">Go →</Link>}
            </div>
            {/* Step 2 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: data.onboarding.hasService ? 'color-mix(in srgb, var(--q-color-success) 12%, transparent)' : 'var(--q-color-ink-50)', border: `1px solid ${data.onboarding.hasService ? 'color-mix(in srgb, var(--q-color-success) 32%, transparent)' : 'var(--q-color-ink-200)'}`, borderRadius: '10px', opacity: data.onboarding.hasWorkflow ? 1 : 0.5 }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, background: data.onboarding.hasService ? 'var(--q-color-success)' : 'var(--q-color-ink-300)', color: 'var(--q-color-paper-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>✓</div>
              <div className="q-fill">
                <h3 className="q-muted">Create a Service Catalog Item</h3>
                <p className="q-meta">Define what you sell and attach a blueprint.</p>
              </div>
              {data.onboarding.hasWorkflow && !data.onboarding.hasService && <Link href="/services" className="q-btn q-btn-secondary">Go →</Link>}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }}>
        
        {/* Main Action Area */}
        <div className="q-stack q-stack-lg">
          
          <div className="q-card">
            <h2 style={{ fontSize: '1.125rem', marginTop: 0, marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
              Action Required: Pending Payments
            </h2>
            {data.pendingPayments.length === 0 ? (
              <div className="q-muted">No pending payments.</div>
            ) : (
              <div className="q-stack">
                {data.pendingPayments.map((tx: any) => (
                  <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--q-color-warm-soft)', border: '1px solid color-mix(in srgb, var(--q-color-warm) 35%, transparent)', borderRadius: '8px' }}>
                    <div>
                      <div className="q-strong">{tx.person?.display_name || 'Client'}</div>
                      <div className="q-meta-plain q-warm">Awaiting payment</div>
                    </div>
                    <div className="q-strong">${Number(tx.amount || 0).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="q-card">
            <h2 className="q-section-title">Open Bookings</h2>
            {data.activeProductions.length === 0 ? (
              <div className="q-muted">No open bookings.</div>
            ) : (
              <div className="q-stack q-stack-md">
                {data.activeProductions.map((prod: any) => (
                  <Link href={`/bookings/${prod.id}`} key={prod.id} className="q-panel q-row q-row-between q-plain-link">
                    <div>
                      <div className="q-strong">{prod.title}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginTop: '4px', textTransform: 'capitalize' }}>Status: {prod.status.replace('_', ' ')}</div>
                    </div>
                    <div>
                      <span className="q-btn q-btn-secondary">Open booking</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Sidebar Feed */}
        <div className="q-card" style={{ alignSelf: 'start' }}>
          <h2 className="q-section-title">Activity Feed</h2>
          <div className="q-stack q-stack-md">
            {data.recentEvents.length === 0 ? (
              <div className="q-muted">No recent activity.</div>
            ) : data.recentEvents.map((evt: any) => (
              <div key={evt.id} style={{ display: 'flex', gap: '12px', fontSize: '0.875rem' }}>
                <div className="q-fill">
                  <span className="q-strong">{evt.person?.display_name || 'System'}</span> 
                  {' '}
                  <span className="q-muted">
                    {evt.action === 'intent_created' ? 'submitted a new booking' :
                     evt.action === 'payment_settled' ? 'paid their invoice' :
                     evt.action === 'message_sent' ? 'sent a message' : 
                     evt.action.replace('_', ' ')}
                  </span>
                  <div className="q-meta">
                    {new Date(evt.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
