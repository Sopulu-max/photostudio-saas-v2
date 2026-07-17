import { supabaseAdmin } from '@/lib/supabase/admin';
import { UploadCloud, FileImage } from 'lucide-react';

export default async function AssetsPage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
  const org = orgs?.[0];

  const { data: assets } = org 
    ? await supabaseAdmin
        .from('assets')
        .select('*')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
    : { data: [] };

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="q-page-title">Assets</h1>
          <p className="q-page-subtitle">All produced and provided artifacts across workflows.</p>
        </div>
        <button className="q-btn q-btn-primary">
          <UploadCloud size={18} style={{ marginRight: '8px' }} />
          Upload Asset
        </button>
      </header>

      <div className="q-grid-cards">
        {!assets || assets.length === 0 ? (
          <div className="q-card" style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
            No assets registered.
          </div>
        ) : (
          assets.map((asset: any) => (
            <div key={asset.id} className="q-card" style={{ padding: '16px' }}>
              <div style={{ width: '100%', aspectRatio: '1', background: 'var(--q-color-paper-subtle)', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--q-color-ink-500)' }}>
                <FileImage size={48} color="var(--q-color-ink-300)" />
              </div>
              <div style={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {asset.file_reference || 'Unnamed Asset'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)', marginTop: '4px' }}>
                {asset.origin} • {asset.status}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
