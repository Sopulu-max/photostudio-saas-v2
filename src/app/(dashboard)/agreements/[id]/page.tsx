import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';
import { FileText, Play } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AgreementDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { orgId } = await getAuthOrgId();

  const { data: agreement } = await supabaseAdmin
    .from('agreements')
    .select(`
      *,
      person:persons(display_name, email),
      workflows(id, status)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!agreement) notFound();

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header">
        <div style={{ marginBottom: '16px' }}>
          <Link href="/agreements" style={{ color: 'var(--q-color-ink-500)', textDecoration: 'none', fontSize: '0.875rem' }}>
            &larr; Back to Agreements
          </Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="q-page-title">Agreement v{agreement.version}</h1>
            <p className="q-page-subtitle">Client: {agreement.person?.display_name}</p>
          </div>
          <span className={`q-badge ${agreement.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
            {agreement.status.toUpperCase()}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <div className="q-card" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.125rem' }}>Terms & Proposal</h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
              The formal terms agreed upon for this production.
            </p>
          </div>
          <button className="q-btn q-btn-secondary">
            <FileText size={16} style={{ marginRight: '8px' }} />
            View Document
          </button>
        </div>

        <div className="q-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', fontWeight: 600 }}>Associated Workflows</h2>
          {!agreement.workflows || agreement.workflows.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)' }}>No active workflows attached to this agreement yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {agreement.workflows.map((wf: any) => (
                <div key={wf.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                  <div>
                    <strong style={{ display: 'block', marginBottom: '4px' }}>Production Pipeline</strong>
                    <span className={`q-badge ${wf.status === 'completed' ? 'q-badge-success' : 'q-badge-warning'}`}>{wf.status}</span>
                  </div>
                  <Link href={`/workflows/${wf.id}`} className="q-btn q-btn-primary">
                    <Play size={16} style={{ marginRight: '8px' }} />
                    Open Board
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
