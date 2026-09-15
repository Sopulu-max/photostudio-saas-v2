import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getPackage, whatCouldBeLeft } from '@/modules/packages/interface';
import { MakeFamilyForm } from '../MoveForms';

export const dynamic = 'force-dynamic';

/** A family made from a standalone package, which becomes its first member. */
export default async function MakeFamilyPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const pkg = await getPackage(params.id);
  if (!pkg || (pkg as any).memberOf || (pkg as any).isFamily || (pkg as any).instance_of) notFound();
  const rows = await whatCouldBeLeft(pkg.id);

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href={`/packages/${pkg.id}`}>&larr; {pkg.name}</Link>
      <header className="q-page-header">
        <div>
          <span className="q-eyebrow">Make a family from</span>
          <h1 className="q-page-title">{pkg.name}</h1>
        </div>
      </header>
      <MakeFamilyForm packageId={pkg.id} packageName={pkg.name} rows={rows} />
    </div>
  );
}
