import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export default async function AnalyticsPage() {
  const { orgId } = await getAuthOrgId();

  const [workflowsRes, intentsRes, txRes, eventsRes] = await Promise.all([
    supabaseAdmin.from('workflows').select('id, status, created_at').eq('organization_id', orgId),
    supabaseAdmin.from('intents').select('id, status, created_at', { count: 'exact' }).eq('organization_id', orgId),
    supabaseAdmin.from('financial_transactions').select('amount, status, direction, created_at').eq('organization_id', orgId),
    supabaseAdmin.from('events').select('action, entity_type, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(20),
  ]);

  const totalSettled = txRes.data
    ?.filter((t: any) => t.status === 'settled' && t.direction === 'inbound')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0;

  const totalPending = txRes.data
    ?.filter((t: any) => t.status === 'pending' && t.direction === 'inbound')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0;

  const activeWorkflows = workflowsRes.data?.filter((w: any) => w.status === 'in_progress').length || 0;
  const completedWorkflows = workflowsRes.data?.filter((w: any) => w.status === 'completed').length || 0;

  const conversionRate = intentsRes.count
    ? Math.round((workflowsRes.data?.length || 0) / intentsRes.count * 100)
    : 0;

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">Analytics</h1>
        <p className="q-page-subtitle">Business intelligence and operational insights for your studio.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Settled Revenue</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>${totalSettled.toFixed(2)}</div>
        </div>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Outstanding</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600, color: '#d97706' }}>${totalPending.toFixed(2)}</div>
        </div>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Active Projects</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{activeWorkflows}</div>
        </div>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Completed Projects</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{completedWorkflows}</div>
        </div>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Total Intents</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{intentsRes.count || 0}</div>
        </div>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Conversion Rate</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{conversionRate}%</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-400)', marginTop: '4px' }}>Intents → Projects</div>
        </div>
      </div>

      <div className="q-card" style={{ padding: '24px' }}>
        <h3 style={{ marginTop: 0, fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Recent System Events</h3>
        {!eventsRes.data || eventsRes.data.length === 0 ? (
          <p style={{ color: 'var(--q-color-ink-500)', fontSize: '0.875rem' }}>No events recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {eventsRes.data.map((ev: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--q-color-ink-100)', fontSize: '0.875rem' }}>
                <div>
                  <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{ev.entity_type}</span>
                  <span style={{ color: 'var(--q-color-ink-500)', margin: '0 8px' }}>·</span>
                  <span style={{ color: 'var(--q-color-ink-600)', fontFamily: 'monospace' }}>{ev.action}</span>
                </div>
                <div style={{ color: 'var(--q-color-ink-400)', fontSize: '0.75rem' }}>
                  {new Date(ev.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
