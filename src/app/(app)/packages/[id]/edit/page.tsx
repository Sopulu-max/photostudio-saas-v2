import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { PackageFieldsEditor } from '../PackageFieldsEditor';
// What this editor needs, and how a package reads back into it, live next to
// the editor rather than in each of the three screens that render it.
import { loadPackageEditorCatalogs, loadPackageForEditor } from '../editorData';

export const dynamic = 'force-dynamic';

export default async function PackageEditPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const loaded = await loadPackageForEditor(params.id);
  if (!loaded) notFound();
  const { pkg, questions, lockedQuestionIds, initial } = loaded;

  const catalogs = await loadPackageEditorCatalogs();

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href={`/packages/${pkg.id}`}>&larr; Back to Package</Link>
      <header className="q-page-header">
        <div>
          {/*
            * The thing, then what you are doing to it — not the other way round.
            *
            * This read "Edit Studio Portrait Photography", which makes the
            * largest text on the page a verb phrase about the operator rather
            * than the name of what they opened. Every other page in the app
            * titles itself with the thing it is about, and a long name turned
            * this one into a sentence fragment that wrapped.
            *
            * The editing is said three times over already: by the back link,
            * by the Save button, and by every field on the page being a field.
            * It does not need to be said in the largest type as well.
            */}
          <span className="q-eyebrow">Editing</span>
          <h1 className="q-page-title">{pkg.name}</h1>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        <PackageFieldsEditor
          mode="edit"
          packageId={pkg.id}
          status={pkg.status}
          currencyCode={catalogs.currencyCode}
          allServices={catalogs.allServices as any}
          allVariables={catalogs.allVariables as any}
          allDeliverables={catalogs.allDeliverables as any}
          dimensionsByDomain={catalogs.dimensionsByDomain}
          roleOptions={catalogs.roleOptions}
          // Edited inside the one form now, rather than by a second editor below
          // its Save button that saved them separately.
          questions={questions}
          lockedQuestionIds={lockedQuestionIds}
          initial={initial}
        />
      </div>
    </div>
  );
}
