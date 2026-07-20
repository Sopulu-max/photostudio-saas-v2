import { supabaseAdmin } from '@/lib/supabase/admin';
import { Settings } from 'lucide-react';

export default async function WorkflowsPage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
  const org = orgs?.[0];

  const { data: workflows } = org 
    ? await supabaseAdmin
        .from('workflows')
        .select(`
          *,
          template:service_templates(name),
          tasks(id, stage_name, status, assigned_person_id)
        `)
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
    : { data: [] };

  const { data: templates } = org 
    ? await supabaseAdmin
        .from('workflow_templates')
        .select('*')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
    : { data: [] };

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="q-page-title">Workflows</h1>
          <p className="q-page-subtitle">Manage your production pipelines and configuration.</p>
        </div>
        <a href="/workflows/new" className="q-btn q-btn-primary">
          Create Template
        </a>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        
        {/* Templates Section */}
        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', color: 'var(--q-color-ink-900)' }}>Workflow Templates</h2>
          {!templates || templates.length === 0 ? (
            <div className="q-card" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)', padding: '32px' }}>
              No workflow templates configured. Create one to standardise your processes.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {templates.map((tpl: any) => (
                <div key={tpl.id} className="q-card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.125rem' }}>{tpl.name}</h3>
                    <span style={{ fontSize: '0.75rem', padding: '4px 8px', background: '#D1FAE5', color: '#065F46', borderRadius: '4px', fontWeight: 500 }}>
                      ACTIVE
                    </span>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
                    {tpl.stages?.length || 0} Stages defined
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {tpl.stages?.map((stage: any, i: number) => (
                      <span key={i} style={{ padding: '4px 8px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-100)', borderRadius: '16px', fontSize: '0.75rem' }}>
                        {stage.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Active Instances Section */}
        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', color: 'var(--q-color-ink-900)' }}>Active Pipelines</h2>
          {!workflows || workflows.length === 0 ? (
            <div className="q-card" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
              No active workflows.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {workflows.map((wf: any) => (
                <div key={wf.id} className="q-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Settings size={20} color="var(--q-color-ink-500)" />
                      {wf.template?.name || 'Custom Workflow'}
                    </h3>
                    <span className={`q-badge ${wf.status === 'completed' ? 'q-badge-success' : 'q-badge-neutral'}`}>
                      {wf.status}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
                    {wf.tasks?.sort((a: any, b: any) => a.stage_order - b.stage_order).map((task: any) => (
                      <div key={task.id} style={{ 
                        minWidth: '200px', 
                        padding: '16px', 
                        background: 'var(--q-color-paper-subtle)', 
                        border: '1px solid var(--q-color-ink-100)',
                        borderRadius: '8px'
                      }}>
                        <div style={{ fontWeight: 500, marginBottom: '8px' }}>{task.stage_name}</div>
                        <span className={`q-badge ${task.status === 'completed' ? 'q-badge-success' : 'q-badge-neutral'}`}>
                          {task.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
