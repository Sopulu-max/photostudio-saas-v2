import { supabaseAdmin } from '@/lib/supabase/admin';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

export default async function WorkflowBlueprintsPage() {
  const { orgId } = await getAuthOrgId();

  const { data: templates } = await supabaseAdmin
    .from('workflow_templates')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  const list = templates || [];

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="q-page-title">Workflow Blueprints</h1>
          <p className="q-page-subtitle">Reusable production pipelines. Attach a blueprint to a service so every booking runs the same stages.</p>
        </div>
        <a href="/workflows/templates/new" className="q-btn q-btn-primary">Create Blueprint</a>
      </header>

      {list.length === 0 ? (
        <div className="q-card" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)', padding: '48px' }}>
          No blueprints yet. Create one to standardise your production pipeline.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {list.map((tpl: any) => (
            <div key={tpl.id} className="q-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <Link href={`/workflows/templates/${tpl.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>{tpl.name}</h3>
                </Link>
                <span className="q-badge q-badge-success">ACTIVE</span>
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '12px' }}>
                {tpl.stages?.length || 0} stage{tpl.stages?.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {tpl.stages?.map((stage: any, i: number) => (
                  <span key={i} style={{ padding: '3px 8px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-100)', borderRadius: '12px', fontSize: '0.75rem' }}>
                    {stage.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
