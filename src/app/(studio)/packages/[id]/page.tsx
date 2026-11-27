import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { packages } from '@/weave/packages/actions';
import { mediaForPackages } from '@/weave/packages/media';
import { elementsForPackages } from '@/weave/packages/elementActions';
import { deliverables } from '@/weave/deliverables/actions';
import { Designer } from './Designer';

export const dynamic = 'force-dynamic';

export default async function PackageDesignerPage({ params }: { params: Promise<{ id: string }> }) {
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
      <header className="q-page-header"><div>
        <Link className="q-back" href="/packages">← All packages</Link>
        <h1 className="q-page-title">Package designer</h1>
        <p className="q-page-subtitle">Edit {pack.name}</p>
      </div></header>
      <Designer pack={pack} media={media} elements={elements} catalogue={catalogue} />
    </div>
  );
}
