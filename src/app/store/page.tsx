import { redirect } from 'next/navigation';
import { StudioShell } from '../StudioShell';
import { whoIsAsking } from '@/weave/studio';
import { priceLists } from '@/weave/store/actions';
import { PriceLists } from './PriceLists';

export const dynamic = 'force-dynamic';

export default async function StorePage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const lists = await priceLists();

  return (
    <StudioShell here="store" studioName={who.studioName}>
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">What you sell</h1>
          <p className="q-page-subtitle">
            {lists.length === 0
              ? 'No price list yet. A gallery can only sell from one of these.'
              : `${lists.length} price ${lists.length === 1 ? 'list' : 'lists'}.`}
          </p>
        </div>
      </header>

      <PriceLists lists={lists} />
    </div>
    </StudioShell>
  );
}
