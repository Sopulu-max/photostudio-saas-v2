import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getOptionalAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

async function getOverviewData() {
  try {
    const supabase = await createClient();
    
    const authOrg = await getOptionalAuthOrgId();
    if (!authOrg) return null;
    const orgId = authOrg.orgId;

    const { data: org, error: orgError } = await supabase.from('organizations').select('id, name').eq('id', orgId).single();
    if (orgError || !org) return null;

    // Fetch actionable data
    const [
      { data: recentEvents },
      { data: activeProductions },
      { data: pendingPayments },
      { count: workflowTemplatesCount },
      { count: serviceTemplatesCount },
      { count: storefrontLayoutsCount }
    ] = await Promise.all([
      supabase.from('events').select('*, person:persons(display_name)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5),
      supabase.from('workflows').select('*, agreement:agreements(id, person:persons(display_name))').eq('organization_id', orgId).in('status', ['created', 'in_progress']).limit(5),
      supabase.from('financial_transactions').select('*, person:persons(display_name)').eq('organization_id', orgId).eq('status', 'pending').limit(5),
      supabase.from('workflow_templates').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
      supabase.from('service_templates').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
      supabase.from('visual_layouts').select('*', { count: 'exact', head: true }).eq('context', 'storefront').eq('status', 'published').eq('organization_id', orgId),
    ]);

    return {
      org,
      recentEvents: recentEvents || [],
      activeProductions: activeProductions || [],
      pendingPayments: pendingPayments || [],
      onboarding: {
        hasWorkflow: (workflowTemplatesCount || 0) > 0,
        hasService: (serviceTemplatesCount || 0) > 0,
        hasStorefront: (storefrontLayoutsCount || 0) > 0,
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
      <div style={{ padding: '48px', color: 'red' }}>
        <h1>FATAL ERROR</h1>
        <p>{data.fatalError}</p>
      </div>
    );
  }

  if (!data) return null;

  const isOnboarding = !data.onboarding.hasWorkflow || !data.onboarding.hasService || !data.onboarding.hasStorefront;

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="q-page-title">Command Center</h1>
          <p className="q-page-subtitle">Good morning. Here is what needs your attention.</p>
        </div>
        <Link href="/workflows/new" className="q-btn q-btn-primary">
          + Manual Booking
        </Link>
      </header>
      
      {isOnboarding && (
        <div className="q-card" style={{ maxWidth: '600px', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: '24px' }}>Setup Checklist</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            {/* Step 1 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: data.onboarding.hasWorkflow ? '#F0FDF4' : '#F9FAFB', border: `1px solid ${data.onboarding.hasWorkflow ? '#BBF7D0' : '#E5E7EB'}`, borderRadius: '8px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: data.onboarding.hasWorkflow ? '#22C55E' : '#D1D5DB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>✓</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem' }}>Create a Workflow Blueprint</h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Define the pipeline of tasks that happen after booking.</p>
              </div>
              {!data.onboarding.hasWorkflow && <Link href="/workflows/templates" className="q-btn q-btn-secondary">Go →</Link>}
            </div>
            {/* Step 2 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: data.onboarding.hasService ? '#F0FDF4' : '#F9FAFB', border: `1px solid ${data.onboarding.hasService ? '#BBF7D0' : '#E5E7EB'}`, borderRadius: '8px', opacity: data.onboarding.hasWorkflow ? 1 : 0.5 }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: data.onboarding.hasService ? '#22C55E' : '#D1D5DB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>✓</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem' }}>Create a Service Catalog Item</h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Define what you sell and attach your workflow blueprint.</p>
              </div>
              {data.onboarding.hasWorkflow && !data.onboarding.hasService && <Link href="/services" className="q-btn q-btn-secondary">Go →</Link>}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }}>
        
        {/* Main Action Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="q-card">
            <h2 style={{ fontSize: '1.125rem', marginTop: 0, marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
              Action Required: Pending Payments
            </h2>
            {data.pendingPayments.length === 0 ? (
              <div style={{ color: 'var(--q-color-ink-500)' }}>No pending payments.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {data.pendingPayments.map((tx: any) => (
                  <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#fffcf2', border: '1px solid #fef08a', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{tx.person?.display_name || 'Client'}</div>
                      <div style={{ fontSize: '0.875rem', color: '#a16207' }}>Awaiting deposit for booking</div>
                    </div>
                    <div style={{ fontWeight: 600 }}>${(tx.amount / 100).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="q-card">
            <h2 style={{ fontSize: '1.125rem', marginTop: 0, marginBottom: '16px' }}>Active Workflows</h2>
            {data.activeProductions.length === 0 ? (
              <div style={{ color: 'var(--q-color-ink-500)' }}>No active workflows.</div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {data.activeProductions.map((prod: any) => (
                  <Link href={`/workflows/${prod.id}`} key={prod.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px', textDecoration: 'none', color: 'inherit' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{prod.agreement?.person?.display_name || 'Production'}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginTop: '4px', textTransform: 'capitalize' }}>Status: {prod.status.replace('_', ' ')}</div>
                    </div>
                    <div>
                      <span className="q-btn q-btn-secondary">Open Workspace</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Sidebar Feed */}
        <div className="q-card" style={{ alignSelf: 'start' }}>
          <h2 style={{ fontSize: '1.125rem', marginTop: 0, marginBottom: '16px' }}>Activity Feed</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {data.recentEvents.length === 0 ? (
              <div style={{ color: 'var(--q-color-ink-500)' }}>No recent activity.</div>
            ) : data.recentEvents.map((evt: any) => (
              <div key={evt.id} style={{ display: 'flex', gap: '12px', fontSize: '0.875rem' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{evt.person?.display_name || 'System'}</span> 
                  {' '}
                  <span style={{ color: 'var(--q-color-ink-600)' }}>
                    {evt.action === 'intent_created' ? 'submitted a new booking' :
                     evt.action === 'payment_settled' ? 'paid their invoice' :
                     evt.action === 'message_sent' ? 'sent a message' : 
                     evt.action.replace('_', ' ')}
                  </span>
                  <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-400)', marginTop: '4px' }}>
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
