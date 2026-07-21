import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Uploader } from '@/components/Uploader';
import { CopyLinkButton } from '@/app/(dashboard)/intents/[id]/CopyLinkButton';

import { getOptionalAuthOrgId } from '@/lib/supabase/getOrgId';

export default async function WorkflowDetailsPage(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params;
  const authOrg = await getOptionalAuthOrgId();
  const orgId = authOrg?.orgId;

  const { data: workflow } = await supabaseAdmin
    .from('workflows')
    .select(`
      *,
      template:workflow_templates(name),
      agreement:agreements(
        id,
        person:persons(display_name, email, phone)
      ),
      tasks(
        id,
        stage_name,
        stage_order,
        status,
        assigned_person_id,
        person:persons(display_name)
      )
    `)
    .eq('id', params.id)
    .single();

  if (!workflow) notFound();

  // Fetch org slug
  let orgSlug = 'studio';
  if (orgId) {
    const { data: org } = await supabaseAdmin.from('organizations').select('slug').eq('id', orgId).single();
    if (org?.slug) orgSlug = org.slug;
  }

  // Fetch pending payment transaction for this agreement
  const { data: pendingTx } = workflow.agreement?.id
    ? await supabaseAdmin
        .from('financial_transactions')
        .select('id, amount, currency, status, type')
        .eq('agreement_id', workflow.agreement.id)
        .in('status', ['pending', 'created'])
        .limit(1)
        .maybeSingle()
    : { data: null };

  const sortedTasks = workflow.tasks?.sort((a: any, b: any) => a.stage_order - b.stage_order) || [];

  const deliveryUrl = `/portal/${orgSlug}/delivery/${workflow.id}`;
  const paymentUrl = pendingTx ? `/portal/${orgSlug}/payment/${pendingTx.id}` : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header className="q-page-header" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="q-page-title">{workflow.agreement?.person?.display_name} — {workflow.template?.name || 'Custom Workflow'}</h1>
            <p className="q-page-subtitle">Production Pipeline · Status: <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{workflow.status.replace('_', ' ')}</span></p>
          </div>
          <a href={`/agreements/${workflow.agreement?.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.875rem' }}>
            View Agreement
          </a>
        </div>
      </header>

      {/* Client Links Panel */}
      <div className="q-card" style={{ display: 'grid', gridTemplateColumns: paymentUrl ? '1fr 1fr' : '1fr', gap: '20px' }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--q-color-ink-600)', marginBottom: '6px' }}>Delivery Gallery Link</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-400)', margin: '0 0 10px' }}>Share with client when work is ready for review.</p>
          <CopyLinkButton url={deliveryUrl} />
        </div>
        {paymentUrl && (
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--q-color-ink-600)', marginBottom: '6px' }}>Payment Link</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-400)', margin: '0 0 10px' }}>
              {pendingTx?.currency} {Number(pendingTx?.amount).toFixed(2)} · {pendingTx?.type?.replace(/_/g, ' ')}
            </p>
            <CopyLinkButton url={paymentUrl} />
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '16px' }}>
        {sortedTasks.length === 0 ? (
          <div className="q-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--q-color-ink-500)', width: '100%' }}>
            No tasks yet. Tasks are seeded automatically when this workflow was spawned from a template.
          </div>
        ) : sortedTasks.map((task: any) => (
          <div key={task.id} style={{
            minWidth: '280px',
            maxWidth: '320px',
            background: 'var(--q-color-paper-subtle)',
            borderRadius: '12px',
            border: '1px solid var(--q-color-ink-100)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--q-color-ink-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{task.stage_name}</h3>
              <span className={`q-badge ${
                task.status === 'completed' ? 'q-badge-success' :
                task.status === 'in_progress' ? 'q-badge-warning' :
                task.status === 'blocked' ? 'q-badge-error' : 'q-badge-neutral'
              }`}>
                {task.status}
              </span>
            </div>

            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-600)' }}>
                <strong>Assigned to:</strong> {task.person?.display_name || 'Unassigned'}
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {task.status === 'created' && (
                  <button className="q-btn q-btn-secondary" style={{ width: '100%', fontSize: '0.875rem' }}>Start Task</button>
                )}
                {task.status === 'in_progress' && (
                  <button className="q-btn q-btn-primary" style={{ width: '100%', fontSize: '0.875rem' }}>Mark Completed</button>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '12px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Upload Asset</div>
                <Uploader workflowId={workflow.id} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

