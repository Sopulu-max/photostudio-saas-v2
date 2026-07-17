import { supabaseAdmin } from '@/lib/supabase/admin';

export default async function AnalyticsPage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
  const org = orgs?.[0];

  // Fetch basic stats
  const [workflowsRes, intentsRes, txRes] = await Promise.all([
    supabaseAdmin.from('workflows').select('id, status', { count: 'exact' }).eq('organization_id', org?.id || ''),
    supabaseAdmin.from('intents').select('id, status', { count: 'exact' }).eq('organization_id', org?.id || ''),
    supabaseAdmin.from('financial_transactions').select('amount').eq('organization_id', org?.id || '').eq('status', 'completed')
  ]);

  const totalRevenue = txRes.data?.reduce((sum, tx) => sum + (tx.amount || 0), 0) || 0;
  const activeWorkflows = workflowsRes.data?.filter(w => w.status === 'in_progress').length || 0;

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">Analytics</h1>
        <p className="q-page-subtitle">Business review and operational metrics.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div className="q-card">
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Total Revenue</div>
          <div style={{ fontSize: '2rem', fontWeight: 600 }}>${(totalRevenue / 100).toFixed(2)}</div>
        </div>
        <div className="q-card">
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Active Workflows</div>
          <div style={{ fontSize: '2rem', fontWeight: 600 }}>{activeWorkflows}</div>
        </div>
        <div className="q-card">
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Total Intents (All time)</div>
          <div style={{ fontSize: '2rem', fontWeight: 600 }}>{intentsRes.count || 0}</div>
        </div>
      </div>

      <div className="q-card">
        <h3>System Events</h3>
        <p style={{ color: 'var(--q-color-ink-500)' }}>A visual chart of event velocity would render here, pulling from the immutable `events` table.</p>
      </div>
    </div>
  );
}
