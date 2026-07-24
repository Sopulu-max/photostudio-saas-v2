import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

export default async function ProductionsPage() {
  const { orgId } = await getAuthOrgId();
  const supabase = await createClient();

  // Fetch all active workflows (Productions)
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select(`
      *,
      template:workflow_templates(name),
      agreement:agreements(
        id,
        person:persons(display_name, email, phone)
      )
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return <div>Error loading workflows.</div>;
  }

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="q-page-title">Workflows</h1>
          <p className="q-page-subtitle">All active client bookings and jobs.</p>
        </div>
        <Link href="/workflows/new" className="q-btn q-btn-primary">
          + Manual Booking
        </Link>
      </header>

      <div className="q-card">
        {(!workflows || workflows.length === 0) ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--q-color-ink-500)' }}>
            No active workflows. Create a manual booking or wait for a client to book via your storefront.
          </div>
        ) : (
          <table className="q-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--q-color-ink-200)', color: 'var(--q-color-ink-500)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '12px 16px' }}>Client</th>
                <th style={{ padding: '12px 16px' }}>Job Type</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Date</th>
                <th style={{ padding: '12px 16px' }}></th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((prod: any) => (
                <tr key={prod.id} style={{ borderBottom: '1px solid var(--q-color-ink-100)' }}>
                  <td style={{ padding: '16px', fontWeight: 500 }}>
                    {prod.agreement?.person?.display_name || 'Unknown Client'}
                    <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', fontWeight: 400 }}>
                      {prod.agreement?.person?.email}
                    </div>
                  </td>
                  <td style={{ padding: '16px', color: 'var(--q-color-ink-600)' }}>
                    {prod.template?.name || 'Custom Booking'}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span className={`q-badge ${prod.status === 'completed' ? 'q-badge-success' : 'q-badge-warning'}`}>
                      {prod.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '16px', color: 'var(--q-color-ink-600)', fontSize: '0.875rem' }}>
                    {new Date(prod.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <Link href={`/workflows/${prod.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.875rem' }}>
                      Open Workspace
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
