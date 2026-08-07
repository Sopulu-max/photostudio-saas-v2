import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudio, getStudioCurrency, listStudioLogins } from '@/kernel/organizations';
import { CURRENCIES } from '@/kernel/currency';
import { StudioForm } from './StudioForm';
import { CurrencyForm } from './CurrencyForm';

export const dynamic = 'force-dynamic';

/**
 * Studio-wide settings only. Anything belonging to one capability lives in that
 * module's own app — stages in Bookings, roles in Team, blueprints in Services.
 * Ordered from the most fundamental outwards: who you are, how you bill, who
 * gets in.
 */
export default async function SettingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  // Who can sign in is a kernel identity question, not a Team one — Team is
  // about who does the work.
  const [org, currencyCode, withLogins] = await Promise.all([
    getStudio(), getStudioCurrency(), listStudioLogins(),
  ]);

  if (!org) {
    return <div className="q-card q-empty-lg">No studio found.</div>;
  }

  const currency = CURRENCIES.find((c) => c.code === currencyCode);

  return (
    <div className="q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Settings</h1>
          <p className="q-page-subtitle">Things true of your whole studio.</p>
        </div>
      </header>

      <div className="q-stack q-stack-lg">

        <section className="q-card q-section">
          <h2 className="q-section-title">Studio</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>Your name and the handle your public links use.</p>
          <StudioForm name={org.name} slug={org.slug || ''} />
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">Billing</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            What you charge in. Currently <strong>{currency?.symbol} {currency?.code}</strong> — {currency?.label}.
          </p>
          <CurrencyForm current={currencyCode} />
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">Access</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            Who can sign in to this studio. To manage who <em>does the work</em>, use{' '}
            <Link href="/team" className="q-link">Team</Link>.
          </p>
          {(!withLogins || withLogins.length === 0) ? (
            <p className="q-empty">Nobody has a login yet.</p>
          ) : (
            <div className="q-stack q-stack-sm">
              {withLogins.map((c) => (
                <div key={c.id} className="q-tile q-row q-row-between">
                  <strong className="q-strong">{c.name}</strong>
                  <span className="q-meta">{c.email}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">Settings that live elsewhere</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            Each app keeps its own configuration, so it sits with the thing it affects.
          </p>
          <div className="q-stack q-stack-sm">
            <Link href="/bookings/settings" className="q-tile q-row q-row-between q-plain-link">
              <div>
                <strong className="q-strong">Booking stages</strong>
                <div className="q-meta">The steps a job moves through, in your words</div>
              </div>
              <span className="q-meta-sm">Bookings &rarr;</span>
            </Link>
            <Link href="/services/settings" className="q-tile q-row q-row-between q-plain-link">
              <div>
                <strong className="q-strong">Groups, blueprints &amp; defaults</strong>
                <div className="q-meta">How your catalogue is arranged, and what a new service starts with</div>
              </div>
              <span className="q-meta-sm">Services &rarr;</span>
            </Link>
            <Link href="/team" className="q-tile q-row q-row-between q-plain-link">
              <div>
                <strong className="q-strong">Roles</strong>
                <div className="q-meta">The roles your productions need</div>
              </div>
              <span className="q-meta-sm">Team &rarr;</span>
            </Link>
            <Link href="/contracts/settings" className="q-tile q-row q-row-between q-plain-link">
              <div>
                <strong className="q-strong">Contract terms</strong>
                <div className="q-meta">The standard terms your contracts start from</div>
              </div>
              <span className="q-meta-sm">Contracts &rarr;</span>
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
