import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { packages } from '@/weave/packages/actions';
import { mediaForPackages } from '@/weave/packages/media';
import { elementsForPackages } from '@/weave/packages/elementActions';
import { deliverables } from '@/weave/deliverables/actions';
import { Designer } from './Designer';

export const dynamic = 'force-dynamic';

/**
 * Building a package.
 *
 * Its own page, because opening a package should show the package. This was
 * what `/packages/<id>` did, so clicking a card put a studio straight into a
 * two-column editor — the thing it had made was never shown to it at all.
 */
export default async function PackageDesignerPage({
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
    <div className="q-page q-page-wide">
      <header className="q-page-header">
        <div>
          {/* The studio's own name for it, exactly as typed. */}
          <h1 className="q-page-title">{pack.name}</h1>
          <p className="q-page-subtitle">
            <Link className="q-auth-link" href={`/packages/${pack.id}`}>Back to it</Link>
          </p>
        </div>
      </header>

      <Designer pack={pack} media={media} elements={elements} catalogue={catalogue} />
    </div>
  );
}
