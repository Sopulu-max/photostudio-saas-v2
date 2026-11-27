import Link from 'next/link';
import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { deliverables } from '@/weave/deliverables/actions';
import { Deliverables } from './Deliverables';

export const dynamic = 'force-dynamic';

/**
 * What this studio delivers.
 *
 * The catalogue everything downstream points at: a package includes these, a
 * price list sells these. It exists so a studio writes a thing down once
 * rather than spelling "8×10 framed" into every package it ever makes.
 */
export default async function DeliverablesPage() {
  if (!await whoIsAsking()) redirect('/login');
  const all = await deliverables();

  const files = all.filter((d) => d.kind === 'digital').length;
  const objects = all.length - files;

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Deliverables</h1>
          {/*
            * Counted by what the engine does with them, because that is the
            * split that matters: files are handed over, objects have to be
            * made and posted by somebody.
            */}
          <p className="q-page-subtitle">
            {all.length === 0
              ? 'Nothing set down yet.'
              : `${files} handed over, ${objects} made and posted.`}
          </p>
        </div>
        {/*
          * The door to pricing. The sidebar no longer carries a 'Products'
          * entry beside this one, so what a gallery SELLS these for is
          * reached from the things themselves.
          */}
        <Link className="q-btn q-btn-secondary" href="/store">Pricing and shopfront</Link>
      </header>

      <Deliverables deliverables={all} />
    </div>
  );
}
