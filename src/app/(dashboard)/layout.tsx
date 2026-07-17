import TopBar from '@/components/navigation/TopBar';
import { VisualEngineOverlay } from '@/components/visual-engine/VisualEngineOverlay';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  let studioName = 'Studio OS';
  const orgId = user?.user_metadata?.organization_id;
  
  if (orgId) {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();
      
    if (org?.name) {
      studioName = org.name;
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar studioName={studioName} />
      <main style={{ flex: 1, padding: '32px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {children}
        </div>
      </main>
      <VisualEngineOverlay />
    </div>
  );
}
