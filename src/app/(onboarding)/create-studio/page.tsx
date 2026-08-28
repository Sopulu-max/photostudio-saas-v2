import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createOrganization } from '@/kernel/organizations';
import { revalidatePath } from 'next/cache';

export default async function CreateStudioPage(props: { searchParams: Promise<{ error?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // If they already have an organization, redirect them to the app grid
  if (user.user_metadata?.organization_id) {
    redirect('/home');
  }

  async function handleCreateOrg(formData: FormData) {
    'use server';
    const name = formData.get('orgName') as string || 'My Studio';
    const uniqueSuffix = Math.random().toString(36).substring(2, 8);
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uniqueSuffix}`;
    
    try {
      await createOrganization(name, slug);
      
      // Force refresh the session so the new JWT claims (organization_id) are picked up by the cookie immediately.
      // This ensures the middleware (proxy.ts) doesn't redirect us right back to /create-studio!
      const supabase = await createClient();
      await supabase.auth.refreshSession();
      
      revalidatePath('/', 'layout');
      redirect('/home'); // Back to the App Grid
    } catch (e: any) {
      if (e.message === 'NEXT_REDIRECT') {
        throw e;
      }
      redirect(`/create-studio?error=${encodeURIComponent(e.message || 'Unknown error')}`);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--q-color-paper-subtle)' }}>
      <div className="q-card" style={{ maxWidth: '440px', width: '100%', padding: '48px' }}>
        <header style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 className="q-page-title" style={{ fontSize: '1.75rem', marginBottom: '8px' }}>Welcome to Weave</h1>
          <p className="q-page-subtitle">Set up your studio to begin.</p>
        </header>

        {searchParams.error && (
          <div className="q-note q-note-bad" style={{ marginBottom: '24px' }}>
            {searchParams.error}
          </div>
        )}

        <form className="q-stack q-stack-lg" action={handleCreateOrg}>
          <div className="q-stack q-stack-sm">
            <label htmlFor="orgName" style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--q-color-ink-900)' }}>Studio Name</label>
            <input
              id="orgName"
              name="orgName"
              required
              placeholder="e.g. Creative Renaissance"
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid var(--q-color-ink-300)',
                fontSize: '1rem',
                fontFamily: 'inherit',
                outline: 'none',
                boxShadow: 'var(--q-shadow-sm)'
              }}
            />
          </div>
          <button type="submit" className="q-btn q-btn-primary" style={{ padding: '14px', width: '100%', fontSize: '1rem' }}>
            Create Studio
          </button>
        </form>
      </div>
    </div>
  );
}
