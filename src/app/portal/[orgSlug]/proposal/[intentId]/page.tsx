import { supabaseAdmin } from '@/lib/supabase/admin';

export default async function ClientProposalPage({ params }: { params: { orgSlug: string, intentId: string } }) {
  // Fetch org by slug
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('slug', params.orgSlug)
    .single();

  if (!org) {
    return <div style={{ padding: '48px', textAlign: 'center', fontFamily: 'sans-serif' }}><h1>Studio Not Found</h1></div>;
  }

  // Fetch Intent
  const { data: intent } = await supabaseAdmin
    .from('intents')
    .select('*, person:persons(display_name), template:service_templates(name, pricing)')
    .eq('id', params.intentId)
    .single();

  if (!intent) {
    return <div style={{ padding: '48px', textAlign: 'center', fontFamily: 'sans-serif' }}><h1>Proposal Not Found</h1></div>;
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '48px', fontFamily: 'sans-serif' }}>
      <header style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '24px', marginBottom: '32px' }}>
        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '8px' }}>{org.name}</div>
        <h1 style={{ fontSize: '2.5rem', margin: '0 0 16px 0' }}>Project Proposal</h1>
        <p style={{ fontSize: '1.125rem', color: '#4b5563', lineHeight: 1.6 }}>Prepared for {intent.person?.display_name || 'Client'}</p>
      </header>

      <div style={{ padding: '32px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', marginBottom: '32px' }}>
        <h3 style={{ marginTop: 0 }}>Service Scope: {intent.template?.name || 'Custom'}</h3>
        <p style={{ color: '#4b5563' }}>This proposal covers the core workflow execution to deliver the finalized assets.</p>
        
        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Total Investment</span>
          <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>
            ${((intent.template?.pricing as any)?.base_price || 0).toFixed(2)}
          </span>
        </div>
      </div>

      <form action={async () => { 'use server'; console.log('Accept Proposal action'); }}>
        <button type="submit" style={{ padding: '16px 32px', width: '100%', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1.125rem', fontWeight: 600, cursor: 'pointer' }}>
          Accept & Sign Agreement
        </button>
      </form>
    </div>
  );
}
