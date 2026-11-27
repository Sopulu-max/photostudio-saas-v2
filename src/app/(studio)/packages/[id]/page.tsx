import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { packages } from '@/weave/packages/actions';
import { isPublished } from '@/weave/packages/shape';
import { mediaForPackages } from '@/weave/packages/media';
import { elementsForPackages } from '@/weave/packages/elementActions';
import { deliverables } from '@/weave/deliverables/actions';
import { PackageOffer } from './edit/PackageOffer';

export const dynamic = 'force-dynamic';

/**
 * One package, as the studio made it.
 *
 * IT SHOWS THE OFFER ITSELF — the same component the designer builds with,
 * handed none of the handles. There was a hand-written page here for a
 * moment: a list of sections, a count beside each deliverable, borrowed row
 * classes, and a line claiming every package "opens a plain gallery" because
 * it passed `null` where the template belonged. A package already has a
 * rendering, and it is a good one. A second is a second thing to keep right,
 * and it was already wrong.
 *
 * `/packages/<id>` used to BE the designer, so clicking a card dropped a
 * studio into a two-column editor and never showed it the thing it had made.
 * Building is at `/packages/<id>/edit`.
 */
export default async function PackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!await whoIsAsking()) redirect('/login');

  const { id } = await params;
  const all = await packages();
  const pack = all.find((p) => p.id === id);
  if (!pack) notFound();

  const [media, elements, catalogue] = await Promise.all([
    mediaForPackages([id]), elementsForPackages([id]), deliverables(),
  ]);

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          {/* The studio's own name for it, exactly as typed. */}
          <h1 className="q-page-title">{pack.name}</h1>
          {/* Whether a client can book it. A thing that happened, not a state. */}
          <p className="q-page-subtitle">
            {isPublished(pack) ? 'Published' : 'Draft'}
          </p>
        </div>

        <Link className="q-btn q-btn-secondary q-btn-sm" href={`/packages/${pack.id}/edit`}>
          Change
        </Link>
      </header>

      <PackageOffer
        name={pack.name}
        about={pack.about ?? ''}
        price={pack.price === null ? '' : String(pack.price / 100)}
        currency={pack.currency}
        elements={elements}
        media={media}
        catalogue={catalogue}
      />
    </div>
  );
}
