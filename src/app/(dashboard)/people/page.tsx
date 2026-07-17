import { supabaseAdmin } from '@/lib/supabase/admin';
import { UserPlus } from 'lucide-react';

export default async function PeopleDirectoryPage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('*').limit(1);
  const org = orgs?.[0];

  const { data: persons } = org 
    ? await supabaseAdmin.from('persons').select('*').eq('organization_id', org.id).order('created_at', { ascending: false })
    : { data: [] };

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="q-page-title">Person Directory</h1>
          <p className="q-page-subtitle">The complete record of every person (clients, staff, vendors).</p>
        </div>
        <button className="q-btn q-btn-primary">
          <UserPlus size={18} style={{ marginRight: '8px' }} />
          Add Person
        </button>
      </header>

      <div className="q-card q-table-container">
        <table className="q-table">
          <thead>
            <tr>
              <th className="q-table-th">Name</th>
              <th className="q-table-th">Type / Role</th>
              <th className="q-table-th">Email</th>
              <th className="q-table-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {persons?.length === 0 ? (
              <tr>
                <td colSpan={4} className="q-table-td" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
                  No persons found.
                </td>
              </tr>
            ) : (
              persons?.map((p: any) => (
                <tr key={p.id} className="q-table-tr">
                  <td className="q-table-td" style={{ fontWeight: 500 }}>{p.display_name}</td>
                  <td className="q-table-td" style={{ textTransform: 'capitalize' }}>{p.type || p.role || 'Unspecified'}</td>
                  <td className="q-table-td" style={{ color: 'var(--q-color-ink-500)' }}>{p.email || '—'}</td>
                  <td className="q-table-td">
                    <span className={`q-badge ${p.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
                      {p.status}
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
