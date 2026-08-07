import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listPackages } from '@/modules/packages/interface';
import { getEnabledDimensions } from '@/modules/services/interface';
import type { PackageDimension } from '@/modules/packages/interface';
import { getStudio, getStudioCurrency } from '@/kernel/organizations';
import { PackagesClient } from './client';

export const dynamic = 'force-dynamic';

const DIM_KEY: Record<PackageDimension, string> = {
  subject: 'subject', occasion: 'occasion', context: 'context', purpose: 'purpose', client: 'client_type',
};

export default async function PackagesPage(props: { searchParams: Promise<{ dim?: string; id?: string; label?: string }> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const sp = await props.searchParams;
  const dim = (sp.dim || '') as PackageDimension;
  const filterId = sp.id || '';
  const isFiltered = !!(dim && filterId && DIM_KEY[dim]);

  const [allPackages, enabledDimensions, currencyCode, org] = await Promise.all([
    listPackages(), getEnabledDimensions(), getStudioCurrency(), getStudio(),
  ]);

  const packages = isFiltered ? (allPackages as any[]).filter((p) => p.services?.some((s: any) => s[DIM_KEY[dim]]?.id === filterId)) : allPackages;
  const activeFilter = isFiltered ? { dim, label: sp.label || '' } : null;

  return (
    <PackagesClient
      initialPackages={packages}
      currencyCode={currencyCode}
      storefrontSlug={org?.slug ?? null}
      enabledDimensions={enabledDimensions}
      activeFilter={activeFilter}
    />
  );
}
