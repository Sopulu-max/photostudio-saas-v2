import React from 'react';
import { getOrgId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { DatabaseOfflineFallback } from '@/components/layout/DatabaseOfflineFallback';
import { StateBadge } from '@/components/ontology/StateBadge';
import { AssetControls } from './AssetControls';

export const dynamic = 'force-dynamic';

export default async function AssetsPage() {
  const orgId = await getOrgId();
  if (!orgId) return <div>Unauthorized</div>;

  let assets: any[] = [];
  let instances: any[] = [];
  let events: any[] = [];
  let signedUrls: Record<string, string> = {};
  let dbOffline = false;

  try {
    const supabase = await createClient();
    const repo = new KernelRepository(supabase);
    
    // We fetch assets and instances
    const { data: aData, error: aErr } = await supabase
      .from('assets')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
      
    if (aErr) throw aErr;
    if (aData) assets = aData;

    instances = await repo.getInstancesByOrganization(orgId);

    const { data: eData } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', orgId)
      .eq('event_type', 'asset.delivered');
    if (eData) events = eData;

    // Generate signed URLs for real storage files
    const storagePaths = assets
      .map(a => a.content_reference)
      .filter(ref => ref && ref.startsWith('storage:studio_assets/'))
      .map(ref => ref.replace('storage:studio_assets/', ''));

    if (storagePaths.length > 0) {
      const { data: urlData } = await supabase.storage.from('studio_assets').createSignedUrls(storagePaths, 3600);
      if (urlData) {
        urlData.forEach((d) => {
          if (!d.error && d.signedUrl) {
            signedUrls[`storage:studio_assets/${d.path}`] = d.signedUrl;
          }
        });
      }
    }

  } catch (error) {
    console.error("Database connection failed", error);
    dbOffline = true;
  }

  const activeInstances = instances.filter(i => 
    i.status === 'in_progress' || i.status === 'waiting'
  );

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      {dbOffline && <DatabaseOfflineFallback />}
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '2rem', marginBottom: '8px' }}>
          Assets & Outcomes
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
          Register provided assets (e.g., flash drives) and manage produced outcomes ready for delivery.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        
        {/* Left Col: The Register/Produce Form (Client Component) */}
        <div style={{ background: 'var(--color-surface-elevated)', padding: '24px', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '16px', fontFamily: 'var(--font-family-serif)' }}>Register New Asset</h2>
          <AssetControls orgId={orgId} activeInstances={activeInstances} />
        </div>

        {/* Right Col: Asset Inventory */}
        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '16px', fontFamily: 'var(--font-family-serif)' }}>Inventory</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {assets.length === 0 ? (
              <div style={{ color: 'var(--color-text-tertiary)', fontSize: '0.9rem' }}>No assets tracked yet.</div>
            ) : (
              assets.map(asset => (
                <div key={asset.id} style={{
                  padding: '16px',
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                      {asset.origin_type}
                    </span>
                    <StateBadge state={asset.status as any} label={asset.status} />
                  </div>
                  
                  <div style={{ fontSize: '1.1rem', fontWeight: 500, fontFamily: 'var(--font-family-serif)' }}>
                    {asset.content_reference.startsWith('storage:') ? 'Uploaded File' : asset.content_reference}
                  </div>

                  {signedUrls[asset.content_reference] && (
                    <img 
                      src={signedUrls[asset.content_reference]} 
                      alt="Asset Thumbnail" 
                      style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--color-border-subtle)' }} 
                    />
                  )}

                  {asset.origin_instance_id && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      Origin Instance: {asset.origin_instance_id.slice(0, 8)}...
                    </div>
                  )}
                  {asset.status === 'registered' && (
                    <div style={{ marginTop: '12px' }}>
                      <AssetControls orgId={orgId} deliverOnly={true} assetId={asset.id} />
                    </div>
                  )}
                  {asset.status === 'delivered' && (
                    <div style={{ 
                      marginTop: '12px', 
                      fontSize: '0.8rem', 
                      color: 'var(--color-state-active)',
                      background: 'rgba(59, 130, 246, 0.05)',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      borderLeft: '2px solid var(--color-state-active)'
                    }}>
                      <strong>Usage Rights:</strong> {
                        events.find(e => e.entity_id === asset.id)?.payload?.terms || 'Standard / Unspecified'
                      }
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
