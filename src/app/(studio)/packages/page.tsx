import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { packages } from '@/weave/packages/actions';
import { mediaForPackages } from '@/weave/packages/media';
import { elementsForPackages } from '@/weave/packages/elementActions';
import { deliverables } from '@/weave/deliverables/actions';
import { isPublished } from '@/weave/packages/shape';
import { promisesAnything, promisesOf } from '@/weave/packages/elements';
import { Packages } from './Packages';

export const dynamic = 'force-dynamic';

/**
 * What you offer.
 *
 * A package produces work: taking a booking that names one opens a gallery
 * sized by what it promised.
 *
 * The subtitle names the gap that matters — a package that promises nothing
 * opens a gallery with no shape, which is the whole thing failing quietly.
 * It used to count packages with no `pictures_promised`, a column nothing
 * fills any more, so it reported a problem every package had.
 */
export default async function PackagesPage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const all = await packages();
  const ids = all.map((p) => p.id);
  const [media, elements, catalogue] = await Promise.all([
    mediaForPackages(ids), elementsForPackages(ids), deliverables(),
  ]);

  const offered = all.filter(isPublished).length;
  const empty = all.filter((p) => !promisesAnything(
    promisesOf(elements.filter((e) => e.packageId === p.id), catalogue),
  )).length;

  const said = all.length === 0
    ? 'No packages.'
    : offered === 0
      ? `${all.length} ${all.length === 1 ? 'package' : 'packages'}, none published.`
      : empty > 0
        ? `${offered} published. ${empty} promising nothing.`
        : `${offered} of ${all.length} published.`;

  return (
    <div className="q-page">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Packages</h1>
          <p className="q-page-subtitle">{said}</p>
        </div>
      </header>

      <Packages
        packages={all} media={media} elements={elements} catalogue={catalogue}
      />
    </div>
  );
}
