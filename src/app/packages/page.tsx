import { redirect } from 'next/navigation';
import { StudioShell } from '../StudioShell';
import { whoIsAsking } from '@/weave/studio';
import { packages } from '@/weave/packages/actions';
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

  const all = await packages();
  const offered = all.filter(isPublished).length;
  const unsaid = all.filter((p) => p.picturesPromised === null).length;

  const said = all.length === 0
    ? 'Nothing offered yet.'
    : offered === 0
      ? `${all.length} written down, none offered to anybody yet.`
      : unsaid > 0
        ? `${offered} offered. ${unsaid} ${unsaid === 1 ? 'does' : 'do'} not say how many pictures yet.`
        : `${offered} of ${all.length} offered.`;

  return (
    <StudioShell here="packages" studioName={who.studioName}>
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">What you offer</h1>
          <p className="q-page-subtitle">{said}</p>
        </div>
      </header>

      <Packages packages={all} />
    </div>
    </StudioShell>
  );
}
