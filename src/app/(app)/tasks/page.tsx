

import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  return (
    <div className="q-page">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Tasks</h1>
          <p className="q-page-subtitle">Track work across your bookings.</p>
        </div>
      </header>

      <div className="q-card q-stack" style={{ padding: '48px 32px', textAlign: 'center' as const }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>📋</div>
        <h2 className="q-heading-md">Coming soon</h2>
        <p className="q-meta" style={{ maxWidth: '420px', margin: '0 auto' }}>
          Task tracking is being rebuilt to work with the new label-based production system.
          In the meantime, you can track work status using labels on your{' '}
          <Link href="/bookings" className="q-link">bookings</Link>.
        </p>
      </div>
    </div>
  );
}
