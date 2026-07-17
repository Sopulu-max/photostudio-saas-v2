import { supabaseAdmin } from '@/lib/supabase/admin';
import { CheckCircle2, Play } from 'lucide-react';

export default async function MyTasksPage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
  const org = orgs?.[0];

  // In a real app, we get the logged in user. We'll fetch all tasks for demo purposes.
  const { data: tasks } = org 
    ? await supabaseAdmin
        .from('tasks')
        .select(`
          *,
          workflow:workflows(id, status, template:service_templates(name))
        `)
        .order('created_at', { ascending: false })
    : { data: [] };

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">My Tasks (Operator)</h1>
        <p className="q-page-subtitle">Your assigned production stages.</p>
      </header>

      <div style={{ display: 'grid', gap: '16px' }}>
        {!tasks || tasks.length === 0 ? (
          <div className="q-card" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
            <CheckCircle2 size={48} color="var(--q-color-ink-300)" style={{ margin: '0 auto 16px' }} />
            No tasks assigned to you.
          </div>
        ) : (
          tasks.map((task: any) => (
            <div key={task.id} className="q-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1.125rem', marginBottom: '4px' }}>{task.stage_name}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
                  Workflow: {task.workflow?.template?.name || 'Custom'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span className={`q-badge ${task.status === 'completed' ? 'q-badge-success' : 'q-badge-neutral'}`}>
                  {task.status}
                </span>
                <button className="q-btn q-btn-primary">
                  <Play size={16} style={{ marginRight: '8px' }} />
                  Open Workspace
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
