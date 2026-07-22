import { supabaseAdmin } from '@/lib/supabase/admin';
import { FileImage } from 'lucide-react';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { AssetUploadClient } from './client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AssetsPage() {
  const { orgId } = await getAuthOrgId();

  const { data: assets } = await supabaseAdmin
        .from('assets')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

  // Get a fallback actor for logging
  const { data: actors } = await supabaseAdmin
    .from('persons')
    .select('id')
    .eq('organization_id', orgId)
    .limit(1);
  const fallbackActorId = actors?.[0]?.id || orgId;

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="q-page-title">Assets</h1>
          <p className="q-page-subtitle">All produced and provided artifacts across workflows.</p>
        </div>
        <AssetUploadClient orgId={orgId} actorId={fallbackActorId} />
      </header>

      <div className="q-grid-cards">
        {!assets || assets.length === 0 ? (
          <div className="q-card" style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
            No assets registered.
          </div>
        ) : (
          assets.map((asset: any) => (
            <Link key={asset.id} href={`/assets/${asset.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div className="q-card" style={{ padding: '16px', height: '100%' }}>
                <div style={{ width: '100%', aspectRatio: '1', background: 'var(--q-color-paper-subtle)', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--q-color-ink-500)' }}>
                  <FileImage size={48} color="var(--q-color-ink-300)" />
                </div>
                <div style={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {asset.file_reference || 'Unnamed Asset'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{asset.origin}</span>
                  <span style={{ textTransform: 'capitalize' }}>{asset.status}</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
