import { supabaseAdmin } from '@/lib/supabase/admin';

export default async function ClientDeliveryPage(props: { params: Promise<{ orgSlug: string, workflowId: string }> }) {
  const params = await props.params;
  // Fetch org by slug
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('slug', params.orgSlug)
    .single();

  if (!org) {
    return <div style={{ padding: '48px', textAlign: 'center', fontFamily: 'sans-serif' }}><h1>Studio Not Found</h1></div>;
  }

  // Fetch Workflow and its assets
  // Using a mock query assuming Assets would be linked via Deliverables or direct Workflow association
  const { data: workflow } = await supabaseAdmin
    .from('workflows')
    .select('*, template:service_templates(name)')
    .eq('id', params.workflowId)
    .single();

  // Fetch assets produced during this workflow
  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('*')
    .eq('workflow_id', params.workflowId)
    .eq('origin', 'produced')
    .in('status', ['available', 'retained', 'released'])
    .order('created_at', { ascending: false });

  if (!workflow) {
    return <div style={{ padding: '48px', textAlign: 'center', fontFamily: 'sans-serif' }}><h1>Delivery Not Found</h1></div>;
  }

  return (
    <div style={{ padding: '48px', fontFamily: 'sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{org.name}</div>
        <h1 style={{ fontSize: '3rem', margin: '0 0 16px 0', fontWeight: 400 }}>{workflow.template?.name || 'Your Project'}</h1>
        <p style={{ fontSize: '1.125rem', color: '#4b5563' }}>Final Deliverables Gallery</p>
      </header>

      {!assets || assets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px', color: '#6b7280', background: '#f9fafb', borderRadius: '12px' }}>
          No deliverables have been produced for this workflow yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px', maxWidth: '1200px', margin: '0 auto' }}>
          {assets.map((asset: any, idx: number) => (
            <div key={asset.id} style={{ aspectRatio: '4/3', background: '#f3f4f6', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
              {asset.type.startsWith('image/') && asset.file_reference ? (
                <img src={asset.file_reference} alt={`Asset ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ color: '#9ca3af', fontWeight: 500 }}>{asset.file_reference ? asset.type : `Asset ${idx + 1}`}</span>
              )}
              
              <div style={{ position: 'absolute', bottom: '16px', right: '16px' }}>
                <a 
                  href={asset.file_reference || '#'} 
                  download 
                  onClick={(e) => {
                    if (!asset.file_reference) {
                      e.preventDefault();
                      alert('This asset is still processing or has no file attached.');
                    }
                  }}
                  style={{ display: 'inline-block', padding: '8px 16px', background: '#fff', color: '#000', textDecoration: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                >
                  Download
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div style={{ textAlign: 'center', marginTop: '64px', paddingTop: '32px', borderTop: '1px solid #e5e7eb', maxWidth: '1200px', margin: '64px auto 0' }}>
        <button style={{ padding: '16px 32px', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1.125rem', fontWeight: 600, cursor: 'pointer' }}>
          Download All
        </button>
      </div>
    </div>
  );
}
