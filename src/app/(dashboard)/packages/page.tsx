import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listPackages } from '@/modules/packages/interface';
import { getStudio, getStudioCurrency } from '@/kernel/organizations';
import { PackagesClient } from './client';

export const dynamic = 'force-dynamic';

type Tagged = { values: { id: string }[] }[];

/**
 * ?value= is a dimension_value id — one parameter, because a value belongs to
 * exactly one dimension of exactly one domain and so already says which
 * question it answers. A package matches if it carries the value itself or if
 * any service it bundles does.
 */
export default async function PackagesPage(props: { searchParams: Promise<{ value?: string; label?: string }> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const sp = await props.searchParams;
  const valueId = sp.value || '';

  const [allPackages, currencyCode, org] = await Promise.all([
    listPackages(), getStudioCurrency(), getStudio(),
  ]);

  const carries = (dims: Tagged | undefined) => (dims || []).some((d) => d.values.some((v) => v.id === valueId));
  const packages = valueId
    ? (allPackages as any[]).filter((p) => carries(p.dimensions) || (p.services || []).some((s: any) => carries(s.dimensions)))
    : allPackages;
  const activeFilter = valueId ? { label: sp.label || 'this classification' } : null;

  return (
    <PackagesClient
      initialPackages={packages}
      currencyCode={currencyCode}
      storefrontSlug={org?.slug ?? null}
      activeFilter={activeFilter}
    />
  );
}
