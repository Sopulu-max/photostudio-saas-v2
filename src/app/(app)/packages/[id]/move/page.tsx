import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getPackage, listFamilies } from '@/modules/packages/interface';
import { MoveToFamilyForm } from '../MoveForms';

export const dynamic = 'force-dynamic';

/** A standalone package joins a family it fits. */
export default async function MovePackagePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const pkg = await getPackage(params.id);
  if (!pkg || (pkg as any).memberOf || (pkg as any).isFamily || (pkg as any).instance_of) notFound();
  const families = await listFamilies();

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href={`/packages/${pkg.id}`}>&larr; {pkg.name}</Link>
      <header className="q-page-header">
        <div>
          <span className="q-eyebrow">Move to a family</span>
          <h1 className="q-page-title">{pkg.name}</h1>
        </div>
      </header>
      <MoveToFamilyForm packageId={pkg.id} packageName={pkg.name} families={families} />
    </div>
  );
}
