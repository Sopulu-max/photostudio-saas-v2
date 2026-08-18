import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getContractTermsTemplate } from '@/modules/contracts/interface';
import { TermsTemplateForm } from './TermsTemplateForm';

export const dynamic = 'force-dynamic';

export default async function ContractSettingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const template = await getContractTermsTemplate();

  return (
    <div className="q-page-narrow">
      <Link href="/contracts" className="q-back">&larr; Back to Contracts</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Contract settings</h1>
          <p className="q-page-subtitle">The standard terms your contracts start from.</p>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        <div className="q-card q-section">
          <h2 className="q-section-title">Terms &amp; conditions</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            Write this once, in your own words — payment schedule, cancellation policy, usage rights, whatever your
            business actually requires. Every new contract copies this in, and you can still adjust it per contract
            afterward.
          </p>
          <TermsTemplateForm initialText={template} />
        </div>
      </div>
    </div>
  );
}
