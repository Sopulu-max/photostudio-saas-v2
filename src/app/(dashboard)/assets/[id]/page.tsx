import { supabaseAdmin } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { CreateDeliverableClient } from './client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AssetDetailPage({ params }: { params: { id: string } }) {
  const { orgId } = await getAuthOrgId();

  const { data: asset } = await supabaseAdmin
    .from('assets')
    .select(`
      *,
      workflow:workflows(id, status, template:service_templates(name))
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!asset) return notFound();

  // Get active agreements to list in the delivery modal
  const { data: agreements } = await supabaseAdmin
    .from('agreements')
    .select('id, person_id, created_at, person:persons(display_name)')
    .eq('organization_id', orgId)
    .in('status', ['active', 'proposed'])
    .order('created_at', { ascending: false });

  // Get a fallback actor for logging
  const { data: actors } = await supabaseAdmin
    .from('persons')
    .select('id')
    .eq('organization_id', orgId)
    .limit(1);
  const fallbackActorId = actors?.[0]?.id || orgId;

  // Check if this asset has already been delivered
  const { data: deliverables } = await supabaseAdmin
    .from('deliverables')
    .select('*, agreement:agreements(id, version), person:persons(display_name)')
    .eq('asset_id', asset.id)
    .eq('organization_id', orgId);

  return (
    <div>
      <Link href="/assets" style={{ display: 'inline-block', marginBottom: '16px', color: 'var(--q-color-ink-500)', textDecoration: 'none', fontSize: '0.875rem' }}>
        ← Back to Assets
      </Link>
      
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="q-page-title">{asset.file_reference || 'Unnamed Asset'}</h1>
          <p className="q-page-subtitle">{asset.id}</p>
        </div>
        <CreateDeliverableClient 
          assetId={asset.id} 
          orgId={orgId} 
          actorId={fallbackActorId} 
          agreements={agreements || []} 
        />
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div className="q-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Metadata</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Origin</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 500 }}>{asset.origin}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Type</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 500 }}>{asset.type}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '1px solid var(--q-color-ink-200)', paddingTop: '16px' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Status</div>
              <div style={{ textTransform: 'capitalize' }}>{asset.status}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Workflow</div>
              <div>
                {asset.workflow ? (
                  <Link href={`/workflows/${asset.workflow.id}`} style={{ color: 'var(--q-color-brand-600)', textDecoration: 'none' }}>
                    View Workflow
                  </Link>
                ) : 'Orphan / Standalone'}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="q-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '16px' }}>Deliverable Status</h3>
            
            {!deliverables || deliverables.length === 0 ? (
              <div style={{ color: 'var(--q-color-ink-500)', fontSize: '0.875rem' }}>
                This asset has not been delivered to any clients.
              </div>
            ) : (
              deliverables.map(del => (
                <div key={del.id} style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--q-color-ink-200)' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '4px' }}>
                    Recipient
                  </div>
                  <div style={{ fontWeight: 500, marginBottom: '8px' }}>
                    {del.person?.display_name || 'Unknown'}
                  </div>
                  
                  <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '4px' }}>
                    Status
                  </div>
                  <div>
                    <span className={`q-badge ${del.status === 'delivered' ? 'q-badge-success' : 'q-badge-warning'}`}>
                      {del.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
