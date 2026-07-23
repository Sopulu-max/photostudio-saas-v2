import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Uploader } from '@/components/Uploader';
import { CopyLinkButton } from '@/app/(dashboard)/intents/[id]/CopyLinkButton';
import { MessageThread } from '@/components/communications/MessageThread';
import { getOptionalAuthOrgId } from '@/lib/supabase/getOrgId';
import { TaskActions } from './TaskActions';

export const dynamic = 'force-dynamic';

export default async function UnifiedProductionWorkspace(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params;
  const authOrg = await getOptionalAuthOrgId();
  const orgId = authOrg?.orgId;

  // 1. Fetch the master record (Workflow acts as the Production container)
  const { data: workflow } = await supabaseAdmin
    .from('workflows')
    .select(`
      *,
      template:workflow_templates(name),
      agreement:agreements(
        id,
        status,
        terms,
        person:persons(id, display_name, email, phone),
        intent:intents(id, form_data, status)
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

  // 2. Fetch Org Slug
  let orgSlug = 'studio';
  if (orgId) {
    const { data: org } = await supabaseAdmin.from('organizations').select('slug').eq('id', orgId).single();
    if (org?.slug) orgSlug = org.slug;
  }

  // 3. Fetch Financials (Ledger)
  const { data: transactions } = workflow.agreement?.id
    ? await supabaseAdmin
        .from('financial_transactions')
        .select('*')
        .eq('agreement_id', workflow.agreement.id)
        .order('created_at', { ascending: true })
    : { data: [] };

  // 4. Fetch Assets
  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('*')
    .eq('workflow_id', workflow.id)
    .order('created_at', { ascending: false });

  // 5. Fetch Messages & Person ID
  let personId = '';
  if (orgId && authOrg?.userId) {
    const { data: personData } = await supabaseAdmin.from('persons').select('id').eq('auth_user_id', authOrg.userId).eq('organization_id', orgId).maybeSingle();
    if (personData) personId = personData.id;
  }

  const { data: initialMessages } = await supabaseAdmin
    .from('events')
    .select('*, person:persons(display_name, role)')
    .eq('organization_id', orgId!)
    .eq('entity_type', 'workflow')
    .eq('entity_id', workflow.id)
    .eq('action', 'message_sent')
    .order('created_at', { ascending: true });

  const sortedTasks = workflow.tasks?.sort((a: any, b: any) => a.stage_order - b.stage_order) || [];
  const pendingTx = transactions?.find((tx: any) => tx.status === 'pending');
  
  const deliveryUrl = `/portal/${orgSlug}/delivery/${workflow.id}`;
  const paymentUrl = pendingTx ? `/portal/${orgSlug}/payment/${pendingTx.id}` : null;
  const agreementUrl = `/portal/${orgSlug}/agreement/${workflow.agreement?.id}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', fontFamily: 'sans-serif' }}>
      
      {/* 1. Master Header */}
      <header style={{ borderBottom: '1px solid var(--q-color-ink-200)', paddingBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Production Workspace
          </div>
          <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 600, color: 'var(--q-color-ink-900)' }}>
            {workflow.agreement?.person?.display_name || 'Unnamed Client'}
          </h1>
          <p style={{ margin: '8px 0 0 0', fontSize: '1.125rem', color: 'var(--q-color-ink-600)' }}>
            {workflow.template?.name || 'Custom Booking'} • {workflow.status.replace('_', ' ')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ padding: '12px 16px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-200)', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)', fontWeight: 600 }}>Client Email</div>
            <div>{workflow.agreement?.person?.email || 'N/A'}</div>
          </div>
          <div style={{ padding: '12px 16px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-200)', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)', fontWeight: 600 }}>Client Phone</div>
            <div>{workflow.agreement?.person?.phone || 'N/A'}</div>
          </div>
        </div>
      </header>

      {/* Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '32px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: The Timeline & Work */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', minWidth: 0 }}>
          
          {/* Section: Inquiry & Agreement */}
          <section>
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '24px', height: '24px', background: 'var(--q-color-ink-900)', color: 'white', borderRadius: '50%', textAlign: 'center', lineHeight: '24px', fontSize: '0.875rem' }}>1</span> 
              Booking & Contract
            </h2>
            <div className="q-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {workflow.agreement?.intent && (
                <div style={{ padding: '16px', background: 'var(--q-color-paper-subtle)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--q-color-ink-600)', marginBottom: '8px' }}>Original Inquiry Data</div>
                  <pre style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(workflow.agreement.intent.form_data, null, 2)}
                  </pre>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--q-color-ink-200)', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Service Agreement</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Status: {workflow.agreement?.status}</div>
                </div>
                <CopyLinkButton url={agreementUrl} />
              </div>
            </div>
          </section>

          {/* Section: Production Pipeline (Kanban) */}
          <section>
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '24px', height: '24px', background: 'var(--q-color-ink-900)', color: 'white', borderRadius: '50%', textAlign: 'center', lineHeight: '24px', fontSize: '0.875rem' }}>2</span> 
              Production Pipeline
            </h2>
            <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '16px' }}>
              {sortedTasks.length === 0 ? (
                <div className="q-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--q-color-ink-500)', width: '100%' }}>
                  No tasks assigned. The workflow is empty.
                </div>
              ) : sortedTasks.map((task: any) => (
                <div key={task.id} style={{ minWidth: '280px', background: 'var(--q-color-paper)', borderRadius: '12px', border: '1px solid var(--q-color-ink-200)', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--q-color-ink-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{task.stage_name}</h3>
                    <span className={`q-badge ${task.status === 'completed' ? 'q-badge-success' : task.status === 'in_progress' ? 'q-badge-warning' : 'q-badge-neutral'}`}>
                      {task.status}
                    </span>
                  </div>
                  <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-600)' }}>
                      <strong>Role:</strong> {task.person?.display_name || 'Unassigned'}
                    </div>
                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <TaskActions 
                        taskId={task.id} 
                        currentStatus={task.status} 
                        organizationId={orgId!} 
                        actorId={personId} 
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section: Asset Pool */}
          <section>
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '24px', height: '24px', background: 'var(--q-color-ink-900)', color: 'white', borderRadius: '50%', textAlign: 'center', lineHeight: '24px', fontSize: '0.875rem' }}>3</span> 
              Asset Pool & Delivery
            </h2>
            <div className="q-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, color: 'var(--q-color-ink-600)' }}>Share the public delivery gallery with the client.</p>
                <CopyLinkButton url={deliveryUrl} />
              </div>
              
              <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '24px' }}>
                <h3 style={{ fontSize: '1rem', margin: '0 0 12px 0' }}>Upload New Assets</h3>
                <Uploader workflowId={workflow.id} />
              </div>

              {assets && assets.length > 0 && (
                <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '24px' }}>
                  <h3 style={{ fontSize: '1rem', margin: '0 0 12px 0' }}>Stored Files</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {assets.map((asset: any) => (
                      <div key={asset.id} style={{ padding: '8px 12px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-200)', borderRadius: '6px', fontSize: '0.875rem' }}>
                        {asset.type} • {asset.status}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

        </div>

        {/* RIGHT COLUMN: The Context (Ledger & Comms) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'sticky', top: '24px' }}>
          
          {/* Financial Ledger */}
          <div className="q-card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.125rem' }}>Financial Ledger</h3>
            {(!transactions || transactions.length === 0) ? (
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>No financial records found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {transactions.map((tx: any) => (
                  <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--q-color-ink-100)' }}>
                    <div>
                      <div style={{ fontWeight: 500, textTransform: 'capitalize' }}>{tx.type.replace('_', ' ')}</div>
                      <div style={{ fontSize: '0.75rem', color: tx.status === 'settled' ? '#059669' : '#d97706' }}>{tx.status.toUpperCase()}</div>
                    </div>
                    <div style={{ fontWeight: 600 }}>${(tx.amount / 100).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
            {paymentUrl && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--q-color-ink-100)' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-600)', marginBottom: '8px' }}>Pending Payment Link</div>
                <CopyLinkButton url={paymentUrl} />
              </div>
            )}
          </div>

          {/* Communications */}
          <MessageThread
            organizationId={orgId!}
            entityType="workflow"
            entityId={workflow.id}
            currentUserId={personId}
            initialMessages={initialMessages || []}
          />
        </div>

      </div>
    </div>
  );
}
