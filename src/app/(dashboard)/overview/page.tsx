import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';

// In a real app, we'd get the organization ID from the authenticated user's session.
// For now, we'll fetch the first organization (or show empty state if none exist).
async function getOverviewData() {
  try {
    const { data: orgs } = await supabaseAdmin.from('organizations').select('id, name').limit(1);
    const org = orgs?.[0];

    if (!org) return null;

    const [
      { count: intentsCount },
      { count: agreementsCount },
      { count: workflowsCount },
      { count: workflowTemplatesCount },
      { count: serviceTemplatesCount },
      { count: storefrontLayoutsCount }
    ] = await Promise.all([
      supabaseAdmin.from('intents').select('*', { count: 'exact', head: true }).eq('organization_id', org.id).eq('status', 'created'),
      supabaseAdmin.from('agreements').select('*', { count: 'exact', head: true }).eq('organization_id', org.id).eq('status', 'active'),
      supabaseAdmin.from('workflows').select('*', { count: 'exact', head: true }).eq('organization_id', org.id).eq('status', 'in_progress'),
      supabaseAdmin.from('workflow_templates').select('*', { count: 'exact', head: true }).eq('organization_id', org.id),
      supabaseAdmin.from('service_templates').select('*', { count: 'exact', head: true }).eq('organization_id', org.id),
      supabaseAdmin.from('visual_layouts').select('*', { count: 'exact', head: true }).eq('organization_id', org.id).eq('context', 'storefront').eq('status', 'published'),
    ]);

    return {
      org,
      stats: {
        newIntents: intentsCount || 0,
        activeAgreements: agreementsCount || 0,
        activeWorkflows: workflowsCount || 0,
      },
      onboarding: {
        hasWorkflow: (workflowTemplatesCount || 0) > 0,
        hasService: (serviceTemplatesCount || 0) > 0,
        hasStorefront: (storefrontLayoutsCount || 0) > 0,
      }
    };
  } catch (err: any) {
    return { fatalError: err.message || 'Unknown error getting overview data' };
  }
}

export default async function OverviewPage({ searchParams }: { searchParams: { error?: string } }) {
  const data = await getOverviewData();

  if (data && 'fatalError' in data) {
    return (
      <div style={{ padding: '48px', color: 'red' }}>
        <h1>FATAL ERROR</h1>
        <p>{data.fatalError}</p>
        <p>Please fix your Vercel Environment Variables.</p>
      </div>
    );
  }

  if (!data) {
    async function handleCreateOrg(formData: FormData) {
      'use server';
      const { createOrganization } = await import('@/lib/actions/organizations');
      const { revalidatePath } = await import('next/cache');
      const { redirect } = await import('next/navigation');
      
      const name = formData.get('orgName') as string || 'My Studio';
      const uniqueSuffix = Math.random().toString(36).substring(2, 8);
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uniqueSuffix}`;
      
      try {
        await createOrganization(name, slug);
        revalidatePath('/', 'layout');
      } catch (e: any) {
        redirect(`/overview?error=${encodeURIComponent(e.message || 'Unknown error')}`);
      }
    }

    return (
      <div>
        <header className="q-page-header">
          <h1 className="q-page-title">Welcome to Weave</h1>
          <p className="q-page-subtitle">Let's set up your first studio.</p>
        </header>
        <div className="q-card" style={{ maxWidth: '400px' }}>
          {searchParams.error && (
            <div style={{ padding: '12px', marginBottom: '24px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '0.875rem', border: '1px solid #fecaca' }}>
              {searchParams.error}
            </div>
          )}
          <form action={handleCreateOrg} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label htmlFor="orgName" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Studio Name</label>
              <input
                id="orgName"
                name="orgName"
                required
                defaultValue="My Studio"
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--q-color-ink-300)',
                  fontSize: '1rem',
                  fontFamily: 'inherit'
                }}
              />
            </div>
            <button type="submit" className="q-btn q-btn-primary" style={{ padding: '12px' }}>
              Create Studio
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Determine if we should show the Onboarding Checklist or the real dashboard
  const isOnboarding = !data.onboarding.hasWorkflow || !data.onboarding.hasService || !data.onboarding.hasStorefront;

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">{data.org.name} Overview</h1>
        <p className="q-page-subtitle">
          {isOnboarding ? 'Complete these steps to launch your studio.' : "Here is what's happening in your studio today."}
        </p>
      </header>
      
      {isOnboarding ? (
        <div className="q-card" style={{ maxWidth: '600px' }}>
          <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: '24px' }}>Setup Checklist</h2>
          
          <div style={{ display: 'grid', gap: '16px' }}>
            {/* Step 1 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: data.onboarding.hasWorkflow ? '#F0FDF4' : '#F9FAFB', border: `1px solid ${data.onboarding.hasWorkflow ? '#BBF7D0' : '#E5E7EB'}`, borderRadius: '8px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: data.onboarding.hasWorkflow ? '#22C55E' : '#D1D5DB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                {data.onboarding.hasWorkflow ? '✓' : '1'}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: data.onboarding.hasWorkflow ? '#166534' : 'var(--q-color-ink-900)' }}>Create a Workflow Template</h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Define the pipeline of tasks that happen after booking.</p>
              </div>
              {!data.onboarding.hasWorkflow && (
                <Link href="/services" className="q-btn q-btn-secondary">Go →</Link>
              )}
            </div>

            {/* Step 2 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: data.onboarding.hasService ? '#F0FDF4' : '#F9FAFB', border: `1px solid ${data.onboarding.hasService ? '#BBF7D0' : '#E5E7EB'}`, borderRadius: '8px', opacity: data.onboarding.hasWorkflow ? 1 : 0.5 }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: data.onboarding.hasService ? '#22C55E' : '#D1D5DB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                {data.onboarding.hasService ? '✓' : '2'}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: data.onboarding.hasService ? '#166534' : 'var(--q-color-ink-900)' }}>Create a Service Template</h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Define what you sell (pricing, deliverables) and attach your workflow.</p>
              </div>
              {data.onboarding.hasWorkflow && !data.onboarding.hasService && (
                <Link href="/services" className="q-btn q-btn-secondary">Go →</Link>
              )}
            </div>

            {/* Step 3 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: data.onboarding.hasStorefront ? '#F0FDF4' : '#F9FAFB', border: `1px solid ${data.onboarding.hasStorefront ? '#BBF7D0' : '#E5E7EB'}`, borderRadius: '8px', opacity: data.onboarding.hasService ? 1 : 0.5 }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: data.onboarding.hasStorefront ? '#22C55E' : '#D1D5DB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                {data.onboarding.hasStorefront ? '✓' : '3'}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: data.onboarding.hasStorefront ? '#166534' : 'var(--q-color-ink-900)' }}>Publish Storefront</h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Design and publish your public booking portal.</p>
              </div>
              {data.onboarding.hasService && !data.onboarding.hasStorefront && (
                <Link href="/services" className="q-btn q-btn-secondary">Go →</Link>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
          <div className="q-card">
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--q-color-ink-500)', fontSize: '0.875rem' }}>New Intents</h3>
            <div style={{ fontSize: '2rem', fontWeight: 600 }}>{data.stats.newIntents}</div>
          </div>
          <div className="q-card">
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--q-color-ink-500)', fontSize: '0.875rem' }}>Active Agreements</h3>
            <div style={{ fontSize: '2rem', fontWeight: 600 }}>{data.stats.activeAgreements}</div>
          </div>
          <div className="q-card">
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--q-color-ink-500)', fontSize: '0.875rem' }}>Workflows In Progress</h3>
            <div style={{ fontSize: '2rem', fontWeight: 600 }}>{data.stats.activeWorkflows}</div>
          </div>
        </div>
      )}
    </div>
  );
}
