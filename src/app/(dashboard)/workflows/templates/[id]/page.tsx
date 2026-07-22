import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function WorkflowTemplateDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let orgId: string;
  try {
    const auth = await getAuthOrgId();
    orgId = auth.orgId;
  } catch (error) {
    redirect('/login');
  }

  const { data: template } = await supabaseAdmin
    .from('workflow_templates')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!template) {
    notFound();
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header">
        <div style={{ marginBottom: '16px' }}>
          <Link href="/workflows" style={{ color: 'var(--q-color-ink-500)', textDecoration: 'none', fontSize: '0.875rem' }}>
            &larr; Back to Workflows
          </Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="q-page-title">{template.name}</h1>
            <p className="q-page-subtitle">Workflow Template Pipeline</p>
          </div>
          <span style={{ 
            padding: '6px 12px', 
            borderRadius: '6px', 
            fontSize: '0.875rem', 
            fontWeight: 600,
            background: template.status === 'active' ? '#D1FAE5' : '#F3F4F6',
            color: template.status === 'active' ? '#065F46' : '#374151'
          }}>
            {template.status.toUpperCase()}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <div className="q-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', fontWeight: 600 }}>Pipeline Stages</h2>
          
          {(!template.stages || template.stages.length === 0) ? (
            <div style={{ color: 'var(--q-color-ink-500)' }}>No stages defined.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
              {/* Vertical line connecting stages */}
              <div style={{ position: 'absolute', left: '16px', top: '24px', bottom: '24px', width: '2px', background: 'var(--q-color-ink-200)', zIndex: 0 }} />
              
              {template.stages.sort((a: any, b: any) => a.order - b.order).map((stage: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: '16px', position: 'relative', zIndex: 1 }}>
                  <div style={{ 
                    width: '34px', height: '34px', borderRadius: '17px', 
                    background: 'var(--q-color-paper-elevated)', border: '2px solid var(--q-color-ink-900)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 600, fontSize: '0.875rem', flexShrink: 0
                  }}>
                    {stage.order}
                  </div>
                  
                  <div style={{ flex: 1, padding: '16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px', background: 'var(--q-color-paper-default)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{stage.name}</h3>
                      {stage.requires_approval && (
                        <span style={{ fontSize: '0.75rem', background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '12px', fontWeight: 500 }}>
                          Requires Approval
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
                      Duration: {stage.duration_hours} hours
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
