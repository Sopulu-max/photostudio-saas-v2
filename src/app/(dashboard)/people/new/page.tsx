import { createPerson } from '@/lib/actions/persons';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

type PersonRole = 'configurator' | 'operator' | 'client' | 'vendor' | 'freelancer';

const ROLE_OPTIONS: { value: PersonRole; label: string }[] = [
  { value: 'operator', label: 'Operator (Staff)' },
  { value: 'configurator', label: 'Configurator (Admin)' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'client', label: 'Client' },
];

export default async function NewPersonPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  await getAuthOrgId(); // guard: throws to setup if unauthenticated
  const { role: presetRole } = await searchParams;
  const defaultRole: PersonRole = ROLE_OPTIONS.some((r) => r.value === presetRole)
    ? (presetRole as PersonRole)
    : 'operator';

  async function handleAction(formData: FormData) {
    'use server';
    const { orgId, userId } = await getAuthOrgId();
    await createPerson({
      organizationId: orgId,
      role: formData.get('role') as PersonRole,
      displayName: String(formData.get('displayName') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      phone: String(formData.get('phone') || '').trim() || undefined,
      actorId: userId,
    });
    redirect('/people');
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <header className="q-page-header">
        <h1 className="q-page-title">Add Person</h1>
        <p className="q-page-subtitle">Add a team member, client, or vendor to your organization&apos;s directory.</p>
      </header>

      <form action={handleAction} className="q-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', fontWeight: 500 }}>Full Name</label>
          <input
            type="text"
            name="displayName"
            placeholder="e.g. Ada Okafor"
            required
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', fontWeight: 500 }}>Role</label>
          <select
            name="role"
            required
            defaultValue={defaultRole}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', background: 'white' }}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', fontWeight: 500 }}>Email <span style={{ color: 'var(--q-color-ink-400)', fontWeight: 400 }}>(optional)</span></label>
          <input
            type="email"
            name="email"
            placeholder="name@example.com"
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', fontWeight: 500 }}>Phone <span style={{ color: 'var(--q-color-ink-400)', fontWeight: 400 }}>(optional)</span></label>
          <input
            type="tel"
            name="phone"
            placeholder="+234 800 000 0000"
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--q-color-ink-100)' }}>
          <a href="/people" className="q-btn q-btn-secondary" style={{ textDecoration: 'none' }}>Cancel</a>
          <button type="submit" className="q-btn q-btn-primary">Add to Directory</button>
        </div>
      </form>
    </div>
  );
}
