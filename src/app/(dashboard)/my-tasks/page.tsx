import { supabaseAdmin } from '@/lib/supabase/admin';
import { CheckCircle2, Play } from 'lucide-react';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MyTasksPage() {
  const { orgId } = await getAuthOrgId();

  const { data: tasks } = await supabaseAdmin
        .from('tasks')
        .select(`
          *,
          workflow:workflows(id, status, template:service_templates(name))
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

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
                <Link href={`/workflows/${task.workflow_id}`} className="q-btn q-btn-primary" style={{ textDecoration: 'none' }}>
                  <Play size={16} style={{ marginRight: '8px' }} />
                  Open Workspace
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
