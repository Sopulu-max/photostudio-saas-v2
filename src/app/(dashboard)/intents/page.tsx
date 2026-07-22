import React from 'react';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

export default async function IntentsPage() {
  const { orgId } = await getAuthOrgId();

  const { data: intents } = await supabaseAdmin
        .from('intents')
        .select(`
          *,
          person:persons(display_name, email),
          template:service_templates(name)
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

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
              intents?.map((intent: any) => {
                const responses = intent.metadata?.form_responses;
                const hasResponses = responses && Object.keys(responses).length > 0;

                return (
                  <React.Fragment key={intent.id}>
                    <tr className="q-table-tr">
                      <td className="q-table-td" style={{ fontWeight: 500 }}>{intent.person?.display_name || 'Anonymous'}</td>
                      <td className="q-table-td">{intent.template?.name || 'Custom Setup'}</td>
                      <td className="q-table-td" style={{ color: 'var(--q-color-ink-500)' }}>{new Date(intent.created_at).toLocaleDateString()}</td>
                      <td className="q-table-td">
                        <span className={`q-badge ${intent.status === 'approved' ? 'q-badge-success' : intent.status === 'pending' ? 'q-badge-warning' : 'q-badge-neutral'}`}>
                          {intent.status}
                        </span>
                      </td>
                      <td className="q-table-td">
                        <Link href={`/intents/${intent.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.875rem' }}>
                          Review Intent
                        </Link>
                      </td>
                    </tr>
                    {hasResponses && (
                      <tr style={{ background: 'var(--q-color-ink-50)' }}>
                        <td colSpan={5} style={{ padding: '16px', borderBottom: '1px solid var(--q-color-ink-200)' }}>
                          <div style={{ fontSize: '0.875rem' }}>
                            <strong style={{ display: 'block', marginBottom: '8px', color: 'var(--q-color-ink-600)' }}>Intake Form Responses:</strong>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                              {Object.entries(responses).map(([key, value]) => (
                                <div key={key} style={{ background: 'white', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--q-color-ink-100)' }}>
                                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--q-color-ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{key}</span>
                                  <span style={{ display: 'block', fontWeight: 500 }}>{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
