import { supabaseAdmin } from '@/lib/supabase/admin';
import Link from 'next/link';

export default async function VisualLayoutsPage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
  const org = orgs?.[0];

  const { data: layouts } = org 
    ? await supabaseAdmin
        .from('visual_layouts')
        .select('*')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
    : { data: [] };

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="q-page-title">Visual Engine</h1>
          <p className="q-page-subtitle">Manage your storefront layouts and client portals.</p>
        </div>
        <button className="q-btn q-btn-primary">Create Layout</button>
      </header>

      <div className="q-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="q-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--q-color-paper-subtle)', borderBottom: '1px solid var(--q-color-ink-100)' }}>
              <th className="q-table-th">Name</th>
              <th className="q-table-th">Context</th>
              <th className="q-table-th">Status</th>
              <th className="q-table-th">Action</th>
            </tr>
          </thead>
          <tbody>
            {!layouts || layouts.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
                  No visual layouts found.
                </td>
              </tr>
            ) : (
              layouts.map((layout: any) => (
                <tr key={layout.id} className="q-table-tr" style={{ borderBottom: '1px solid var(--q-color-ink-100)' }}>
                  <td className="q-table-td" style={{ fontWeight: 500 }}>{layout.name || 'Untitled'}</td>
                  <td className="q-table-td" style={{ textTransform: 'capitalize' }}>{layout.context}</td>
                  <td className="q-table-td">
                    <span className={`q-badge ${layout.status === 'published' ? 'q-badge-success' : 'q-badge-neutral'}`}>
                      {layout.status}
                    </span>
                  </td>
                  <td className="q-table-td">
                    <Link href={`/visual-layouts/${layout.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.875rem', padding: '6px 12px' }}>
                      Edit Canvas
                    </Link>
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
