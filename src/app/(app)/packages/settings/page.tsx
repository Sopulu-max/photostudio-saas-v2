import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

/**
 * Packages' own settings — the marketing layer's configuration.
 * The five classification dimensions (Subject, Occasion,
 * Context, Purpose, Client) apply to Service just as much as Package, so
 * they're managed once, in Services settings, not duplicated here.
 */
export default async function PackageSettingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  return (
    <div className="q-page-narrow">
      <Link href="/packages" className="q-back">&larr; Back to Packages</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Package settings</h1>
          <p className="q-page-subtitle">How your offerings are arranged and described.</p>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        <section className="q-card q-section">
          <h2 className="q-section-title">Subject, Occasion, Context, Purpose, Client</h2>
          <p className="q-meta">
            These apply to what you do (Services) just as much as what you sell (Packages), so they&rsquo;re managed in one
            place. <Link href="/services/settings" className="q-link">Manage them in Service settings &rarr;</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
