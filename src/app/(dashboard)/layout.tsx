import { Sidebar } from '@/components/navigation/Sidebar';
import TopBar from '@/components/navigation/TopBar';
import { VisualEngineOverlay } from '@/components/visual-engine/VisualEngineOverlay';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

import { getOptionalAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let studioName = 'Studio OS';
  let orgSlug: string | undefined;
  
  const authOrg = await getOptionalAuthOrgId();
  const orgId = authOrg?.orgId;

  if (orgId) {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, slug')
      .eq('id', orgId)
      .single();

    if (org?.name) studioName = org.name;
    if (org?.slug) orgSlug = org.slug;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row' }}>
      <Sidebar studioName={studioName} orgSlug={orgSlug} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <TopBar studioName={studioName} />
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {children}
          </div>
        </main>
      </div>
      <VisualEngineOverlay />
    </div>
  );
}
