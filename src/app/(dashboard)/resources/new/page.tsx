import { supabaseAdmin } from '@/lib/supabase/admin';
import { createResource } from '@/lib/actions/resources';
import { redirect } from 'next/navigation';

export default async function NewResourcePage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
  const org = orgs?.[0];

  async function handleAction(formData: FormData) {
    'use server';
    await createResource(formData);
    redirect('/resources');
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <header className="q-page-header">
        <h1 className="q-page-title">Add Resource</h1>
        <p className="q-page-subtitle">Add a new physical asset or studio space to your inventory.</p>
      </header>

      <form action={handleAction} className="q-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <input type="hidden" name="orgId" value={org?.id || ''} />
        
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', fontWeight: 500 }}>Resource Name</label>
          <input
            type="text"
            name="name"
            placeholder="e.g. Studio A, Sony A7IV"
            required
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', fontWeight: 500 }}>Resource Type</label>
          <select
            name="type"
            required
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', background: 'white' }}
          >
            <option value="room">Studio Room</option>
            <option value="camera">Camera Body</option>
            <option value="lens">Lens</option>
            <option value="lighting">Lighting Equipment</option>
            <option value="prop">Prop</option>
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--q-color-ink-100)' }}>
          <button type="submit" className="q-btn q-btn-primary">Add to Inventory</button>
        </div>
      </form>
    </div>
  );
}
