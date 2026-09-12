import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudioCurrency } from '@/kernel/organizations';
import { getLeftToMember } from '@/modules/packages/interface';
import { MemberForm } from '../../MemberForm';

export const dynamic = 'force-dynamic';

/**
 * A new member of a family. The only door into membership: the family is
 * known before the first field is drawn, and the form is exactly what the
 * family left to its members.
 */
export default async function NewMemberPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  let loaded: Awaited<ReturnType<typeof getLeftToMember>>;
  try {
    loaded = await getLeftToMember(params.id);
  } catch {
    notFound();
  }
  const currencyCode = await getStudioCurrency();

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href={`/packages/${loaded.family.id}`}>&larr; {loaded.family.name}</Link>
      <header className="q-page-header">
        <div>
          <span className="q-eyebrow">New member of</span>
          <h1 className="q-page-title">{loaded.family.name}</h1>
        </div>
      </header>
      <MemberForm family={loaded.family} left={loaded.left} currencyCode={currencyCode} />
    </div>
  );
}
