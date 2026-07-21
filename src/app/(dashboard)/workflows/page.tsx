import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function WorkflowsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = user?.user_metadata?.organization_id;

  if (!orgId) redirect('/login');

  const [workflowsResult, templatesResult] = await Promise.all([
    supabaseAdmin
      .from('workflows')
      .select(`
        *,
        template:workflow_templates(name),
        agreement:agreements(person:persons(display_name)),
        tasks(id, stage_name, stage_order, status, assigned_person_id)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('workflow_templates')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
  ]);

  const workflows = workflowsResult.data || [];
  const templates = templatesResult.data || [];

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="q-page-title">Production Engine</h1>
          <p className="q-page-subtitle">Manage templates and active production pipelines.</p>
        </div>
        <a href="/workflows/new" className="q-btn q-btn-primary">Create Template</a>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

        {/* Templates */}
        <section>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px', color: 'var(--q-color-ink-700)' }}>Workflow Templates</h2>
          {templates.length === 0 ? (
            <div className="q-card" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)', padding: '32px' }}>
              No templates yet. Create one to standardise your production pipeline.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {templates.map((tpl: any) => (
                <div key={tpl.id} className="q-card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{tpl.name}</h3>
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
        </section>

        {/* Active Pipelines */}
        <section>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px', color: 'var(--q-color-ink-700)' }}>Active Pipelines</h2>
          {workflows.length === 0 ? (
            <div className="q-card" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)', padding: '32px' }}>
              No active workflows. They are spawned automatically when a client signs an agreement.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {workflows.map((wf: any) => {
                const sortedTasks = (wf.tasks || []).sort((a: any, b: any) => a.stage_order - b.stage_order);
                const completedCount = sortedTasks.filter((t: any) => t.status === 'completed').length;
                const progress = sortedTasks.length > 0 ? Math.round((completedCount / sortedTasks.length) * 100) : 0;
                return (
                  <div key={wf.id} className="q-card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 600 }}>
                          {wf.agreement?.person?.display_name || 'Unknown Client'}
                        </h3>
                        <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
                          {wf.template?.name || 'Custom Workflow'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className={`q-badge ${wf.status === 'completed' ? 'q-badge-success' : wf.status === 'in_progress' ? 'q-badge-warning' : 'q-badge-neutral'}`}>
                          {wf.status.replace('_', ' ')}
                        </span>
                        <Link href={`/workflows/${wf.id}`} className="q-btn q-btn-secondary" style={{ padding: '6px 12px', fontSize: '0.875rem' }}>
                          Open
                        </Link>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--q-color-ink-500)', marginBottom: '6px' }}>
                        <span>{completedCount}/{sortedTasks.length} stages complete</span>
                        <span>{progress}%</span>
                      </div>
                      <div style={{ height: '4px', background: 'var(--q-color-ink-100)', borderRadius: '2px' }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--q-color-ink-900)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {sortedTasks.map((task: any) => (
                        <span key={task.id} style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          background: task.status === 'completed' ? '#D1FAE5' : task.status === 'in_progress' ? '#FEF3C7' : 'var(--q-color-paper-subtle)',
                          color: task.status === 'completed' ? '#065F46' : task.status === 'in_progress' ? '#92400E' : 'var(--q-color-ink-600)',
                          border: '1px solid',
                          borderColor: task.status === 'completed' ? '#A7F3D0' : task.status === 'in_progress' ? '#FDE68A' : 'var(--q-color-ink-100)',
                        }}>
                          {task.stage_name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
