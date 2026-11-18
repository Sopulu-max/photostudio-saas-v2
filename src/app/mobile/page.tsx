import Link from 'next/link';
import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { readBoard } from '@/weave/jobs/actions';
import { occasionsBetween } from '@/weave/occasions/actions';
import { allOrders } from '@/weave/store/actions';
import { standingOf } from '@/weave/store/shape';
import { MobileToday } from './MobileToday';

/**
 * The phone is a companion, not a compressed desktop dashboard. It reads the
 * next concrete work across the existing system and offers only explicit,
 * reversible-by-command state changes.
 */
export const dynamic = 'force-dynamic';

export default async function MobilePage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');
  const today = new Date().toLocaleDateString('en-CA');
  const [board, occasions, orders] = await Promise.all([
    readBoard(),
    occasionsBetween(today, today),
    allOrders(),
  ]);
  const needingAttention = orders.filter((order) => standingOf(order) !== 'done');

  return (
    <main className="q-mobile">
      <header className="q-mobile-head">
        <Link href="/" className="q-mobile-mark" aria-label="Back to studio">W</Link>
        <div>
          <span className="q-eyebrow">{who.studioName}</span>
          <h1 className="q-mobile-title">Today</h1>
        </div>
        <Link href="/galleries" className="q-mobile-link">Galleries</Link>
      </header>
      <MobileToday board={board} occasions={occasions} orders={needingAttention} />
    </main>
  );
}
