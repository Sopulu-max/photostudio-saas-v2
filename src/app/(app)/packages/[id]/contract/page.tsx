import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getPackage } from '@/modules/packages/interface';
import { PackageContractClient } from './client';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function PackageContractPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const pkg = await getPackage(params.id);
  if (!pkg) notFound();

  const { orgId } = await getAuthOrgId();

  // Figure out the fallback text to show as a placeholder if they haven't overridden it
  let fallbackTerms = '';
  if (pkg.memberOf) {
    const { data: family } = await supabaseAdmin
      .from('packages')
      .select('contract_terms')
      .eq('id', pkg.memberOf)
      .maybeSingle();
    
    if (typeof family?.contract_terms === 'string') {
      fallbackTerms = family.contract_terms;
    }
  }

  // If there's still no fallback terms (or it wasn't a member), fall back to studio standing text
  if (!fallbackTerms) {
    const { data: org } = await supabaseAdmin.from('organizations').select('metadata').eq('id', orgId).maybeSingle();
    fallbackTerms = ((org?.metadata as any)?.contracts?.terms_template as string) || 'No studio default contract text set.';
  }

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href={`/packages/${pkg.id}`}>&larr; {pkg.name}</Link>
      <header className="q-page-header">
        <div>
          <span className="q-eyebrow">Edit Contract</span>
          <h1 className="q-page-title">{pkg.name}</h1>
        </div>
      </header>

      <PackageContractClient
        packageId={pkg.id}
        packageName={pkg.name}
        initialTerms={pkg.contract_terms}
        fallbackTerms={fallbackTerms}
        isMember={Boolean(pkg.memberOf)}
      />
    </div>
  );
}
