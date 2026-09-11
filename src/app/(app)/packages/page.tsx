import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listPackages, listPackagesPublicWithDimensions, shopWindowsOf } from '@/modules/packages/interface';
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

  /*
   * The studio's shop windows, derived from exactly the rows the public page
   * derives them from — so the links offered here are the windows a client
   * will actually find. Two or more and each gets a link of its own; one and
   * the whole-catalogue link already is that window.
   */
  const windows = org ? shopWindowsOf(await listPackagesPublicWithDimensions(org.id)) : [];

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
      windows={windows.length > 1 ? windows : []}
      activeFilter={activeFilter}
    />
  );
}
