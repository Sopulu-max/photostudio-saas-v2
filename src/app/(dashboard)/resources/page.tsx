import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

export default async function ResourcesPage() {
  const { orgId } = await getAuthOrgId();

  const { data: resources } = await supabaseAdmin
        .from('resources')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="q-page-title">Resource Inventory</h1>
          <p className="q-page-subtitle">Equipment, spaces, and software licenses.</p>
        </div>
        <a href="/resources/new" className="q-btn q-btn-primary">Add Resource</a>
      </header>

      <div className="q-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--q-color-paper-subtle)', borderBottom: '1px solid var(--q-color-ink-100)' }}>
              <th style={{ padding: '16px', fontWeight: 500, color: 'var(--q-color-ink-500)' }}>Name</th>
              <th style={{ padding: '16px', fontWeight: 500, color: 'var(--q-color-ink-500)' }}>Type</th>
              <th style={{ padding: '16px', fontWeight: 500, color: 'var(--q-color-ink-500)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {!resources || resources.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
                  No resources registered in inventory.
                </td>
              </tr>
            ) : (
              resources.map((resource: any) => (
                <tr key={resource.id} style={{ borderBottom: '1px solid var(--q-color-ink-100)' }}>
                  <td style={{ padding: '16px', fontWeight: 500 }}>{resource.name}</td>
                  <td style={{ padding: '16px', textTransform: 'capitalize' }}>{resource.type}</td>
                  <td style={{ padding: '16px' }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: '4px', 
                      fontSize: '0.75rem', 
                      fontWeight: 500,
                      background: resource.status === 'active' ? '#D1FAE5' : '#FEE2E2',
                      color: resource.status === 'active' ? '#065F46' : '#991B1B'
                    }}>
                      {resource.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
