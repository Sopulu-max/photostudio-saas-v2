import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getTaxRate } from '@/modules/finances/interface';
import { TaxRateForm } from './TaxRateForm';

export const dynamic = 'force-dynamic';

/**
 * Finances' own settings. A module owns its configuration — only things true of
 * the whole studio live in global Settings.
 */
export default async function FinanceSettingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const taxRate = await getTaxRate();

  return (
    <div className="q-page-narrow">
      <Link href="/finances" className="q-back">&larr; Back to Finances</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Finance settings</h1>
          <p className="q-page-subtitle">How money is calculated on the documents you send.</p>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        <div className="q-card q-section">
          <h2 className="q-section-title">Tax</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            Applied to the total of every invoice raised from now on. Each invoice records the rate
            it was raised at, so past invoices keep the figure the client was given.
          </p>
          <TaxRateForm initialRate={taxRate} />
        </div>
      </div>
    </div>
  );
}
