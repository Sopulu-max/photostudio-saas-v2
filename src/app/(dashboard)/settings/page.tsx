import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { CurrencyForm } from './CurrencyForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { orgId } = await getAuthOrgId();
  const { data: org } = await supabaseAdmin.from('organizations').select('*').eq('id', orgId).single();

  const { data: contacts } = await supabaseAdmin.from('contacts').select('*').eq('organization_id', orgId);

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">Settings</h1>
        <p className="q-page-subtitle">Manage organization config, team members, and resources.</p>
      </header>

      <div className="q-card q-section" style={{ marginBottom: '24px' }}>
        <h2 className="q-section-title">Currency</h2>
        <p className="q-meta" style={{ marginBottom: '14px' }}>What your studio bills in.</p>
        <CurrencyForm current={org?.currency || 'USD'} />
      </div>

      {org ? (
        <div style={{ display: 'grid', gap: '32px' }}>
          <div className="q-card">
            <h3>Organization Profile</h3>
            <div style={{ display: 'grid', gap: '16px', maxWidth: '400px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>Studio Name</label>
                <input className="q-input" type="text" defaultValue={org.name} readOnly />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>Studio Slug</label>
                <input className="q-input" type="text" defaultValue={org.slug || ''} readOnly />
              </div>
            </div>
          </div>

          <div className="q-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Team Members (Persons)</h3>
              <a href="/people/new?role=operator" className="q-btn q-btn-primary" style={{ fontSize: '0.875rem', textDecoration: 'none' }}>+ Add Member</a>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--q-color-ink-100)' }}>
                  <th style={{ padding: '12px 0', fontWeight: 500 }}>Name</th>
                  <th style={{ padding: '12px 0', fontWeight: 500 }}>Role</th>
                  <th style={{ padding: '12px 0', fontWeight: 500 }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {contacts?.map((p: any) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--q-color-ink-100)' }}>
                    <td style={{ padding: '12px 0' }}>{p.display_name}</td>
                    <td style={{ padding: '12px 0', textTransform: 'capitalize' }}>{p.role}</td>
                    <td style={{ padding: '12px 0', color: 'var(--q-color-ink-500)' }}>{p.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="q-card" style={{ textAlign: 'center', padding: '48px' }}>
          No organization found.
        </div>
      )}
    </div>
  );
}
