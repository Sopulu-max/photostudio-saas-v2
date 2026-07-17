import { supabaseAdmin } from '@/lib/supabase/admin';

export default async function IntentsPage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
  const org = orgs?.[0];

  const { data: intents } = org 
    ? await supabaseAdmin
        .from('intents')
        .select(`
          *,
          person:persons(display_name, email),
          template:service_templates(name)
        `)
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
    : { data: [] };

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">Intents</h1>
        <p className="q-page-subtitle">Incoming inquiries and desires for production.</p>
      </header>

      <div className="q-card q-table-container">
        <table className="q-table">
          <thead>
            <tr>
              <th className="q-table-th">Client</th>
              <th className="q-table-th">Service Request</th>
              <th className="q-table-th">Submitted</th>
              <th className="q-table-th">Status</th>
              <th className="q-table-th">Action</th>
            </tr>
          </thead>
          <tbody>
            {!intents || intents.length === 0 ? (
              <tr>
                <td colSpan={5} className="q-table-td" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
                  No intents in queue.
                </td>
              </tr>
            ) : (
              intents?.map((intent: any) => (
                <tr key={intent.id} className="q-table-tr">
                  <td className="q-table-td" style={{ fontWeight: 500 }}>{intent.person?.display_name || 'Anonymous'}</td>
                  <td className="q-table-td">{intent.template?.name || 'Custom Setup'}</td>
                  <td className="q-table-td" style={{ color: 'var(--q-color-ink-500)' }}>{new Date(intent.created_at).toLocaleDateString()}</td>
                  <td className="q-table-td">
                    <span className={`q-badge ${intent.status === 'approved' ? 'q-badge-success' : intent.status === 'pending' ? 'q-badge-warning' : 'q-badge-neutral'}`}>
                      {intent.status}
                    </span>
                  </td>
                  <td className="q-table-td">
                    <button className="q-btn q-btn-secondary" style={{ fontSize: '0.875rem' }}>Review Intent</button>
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
