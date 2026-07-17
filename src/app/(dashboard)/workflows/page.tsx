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

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">Workflows</h1>
        <p className="q-page-subtitle">Active production pipelines and task stages.</p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {!workflows || workflows.length === 0 ? (
          <div className="q-card" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
            No active workflows.
          </div>
        ) : (
          workflows.map((wf: any) => (
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
          ))
        )}
      </div>
    </div>
  );
}
