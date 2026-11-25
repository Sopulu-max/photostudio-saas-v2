import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { packages } from '@/weave/packages/actions';
import { galleryTemplates } from '@/weave/galleries/actions';
import { mediaForPackages } from '@/weave/packages/media';
import { isPublished } from '@/weave/packages/shape';
import { Packages } from './Packages';

export const dynamic = 'force-dynamic';

/**
 * What you offer.
 *
 * The old system held a package as a sentence and could do nothing with it.
 * Here a package produces work: taking a booking that names one opens a
 * gallery sized by what it promised.
 *
 * The subtitle names the gap that matters — a package with no number of
 * pictures opens a gallery with no shape, which is the whole thing failing
 * quietly.
 */
export default async function PackagesPage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const [all, templates] = await Promise.all([packages(), galleryTemplates()]);
  const media = await mediaForPackages(all.map((p) => p.id));
  const offered = all.filter(isPublished).length;
  const unsaid = all.filter((p) => p.picturesPromised === null).length;

  const said = all.length === 0
    ? 'No packages.'
    : offered === 0
      ? `${all.length} ${all.length === 1 ? 'package' : 'packages'}, none published.`
      : unsaid > 0
        ? `${offered} published. ${unsaid} without an image count.`
        : `${offered} of ${all.length} published.`;

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Packages</h1>
          <p className="q-page-subtitle">{said}</p>
        </div>
      </header>

      <Packages packages={all} templates={templates} media={media} />
    </div>
  );
}
