import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { UserPlus } from 'lucide-react';

import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export default async function PeopleDirectoryPage() {
  const { orgId } = await getAuthOrgId();

  const { data: persons } = await supabaseAdmin
    .from('persons')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  const clients = persons?.filter((p: any) => p.role === 'client') || [];
  const staff = persons?.filter((p: any) => ['configurator', 'operator'].includes(p.role)) || [];

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="q-page-title">Person Directory</h1>
          <p className="q-page-subtitle">Complete record of every person — clients, staff, and vendors.</p>
        </div>
        <button className="q-btn q-btn-primary">
          <UserPlus size={18} style={{ marginRight: '8px' }} />
          Add Person
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Total People</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{persons?.length || 0}</div>
        </div>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Clients</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{clients.length}</div>
        </div>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Team Members</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{staff.length}</div>
        </div>
      </div>

      <div className="q-card q-table-container">
        <table className="q-table">
          <thead>
            <tr>
              <th className="q-table-th">Name</th>
              <th className="q-table-th">Role</th>
              <th className="q-table-th">Email</th>
              <th className="q-table-th">Phone</th>
              <th className="q-table-th">Status</th>
              <th className="q-table-th">Action</th>
            </tr>
          </thead>
          <tbody>
            {!persons || persons.length === 0 ? (
              <tr>
                <td colSpan={6} className="q-table-td" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
                  No persons found.
                </td>
              </tr>
            ) : (
              persons?.map((p: any) => (
                <tr key={p.id} className="q-table-tr">
                  <td className="q-table-td" style={{ fontWeight: 500 }}>{p.display_name}</td>
                  <td className="q-table-td">
                    <span className={`q-badge ${
                      p.role === 'configurator' ? 'q-badge-success' :
                      p.role === 'operator' ? 'q-badge-warning' : 'q-badge-neutral'
                    }`} style={{ textTransform: 'capitalize' }}>
                      {p.role}
                    </span>
                  </td>
                  <td className="q-table-td" style={{ color: 'var(--q-color-ink-500)' }}>{p.email || '—'}</td>
                  <td className="q-table-td" style={{ color: 'var(--q-color-ink-500)' }}>{p.phone || '—'}</td>
                  <td className="q-table-td">
                    <span className={`q-badge ${p.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="q-table-td">
                    <a href={`/people/${p.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.875rem', textDecoration: 'none' }}>
                      View Profile
                    </a>
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
