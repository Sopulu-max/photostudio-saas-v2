import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listStages } from '@/modules/bookings/interface';
import { StageSettings } from './StageSettings';

export const dynamic = 'force-dynamic';

/**
 * Bookings' own settings. A module owns its configuration — only things true of
 * the whole studio live in global Settings.
 */
export default async function BookingSettingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const stages = await listStages();

  return (
    <div className="q-page-narrow">
      <header className="q-page-header">
        <div>
          <Link href="/bookings" className="q-back">&larr; Back to Bookings</Link>
          <h1 className="q-page-title">Booking settings</h1>
          <p className="q-page-subtitle">How your studio runs a job, in your own words.</p>
        </div>
      </header>

      <div className="q-card">
        <h2 className="q-section-title">Stages</h2>
        <p className="q-meta" style={{ marginBottom: '18px' }}>
          The steps a booking moves through. Rename them, add your own, remove what you don’t use.
        </p>
        <StageSettings stages={stages} />
      </div>
    </div>
  );
}
