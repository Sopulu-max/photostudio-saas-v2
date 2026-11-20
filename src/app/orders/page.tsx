import { redirect } from 'next/navigation';
import { StudioShell } from '../StudioShell';
import { whoIsAsking } from '@/weave/studio';
import { allOrders } from '@/weave/store/actions';
import { standingOf } from '@/weave/store/shape';
import { OrderList } from './OrderList';

export const dynamic = 'force-dynamic';

/**
 * Orders, newest first, with what needs doing said first.
 *
 * The heading counts only what is OUTSTANDING, because a running total of
 * everything ever sold informs nobody opening this page in the morning.
 */
export default async function OrdersPage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const orders = await allOrders();
  const unpaid = orders.filter((o) => standingOf(o) === 'unpaid').length;
  const toMake = orders.filter((o) => standingOf(o) === 'to make').length;

  const said = orders.length === 0
    ? 'No orders.'
    : [
        unpaid > 0 ? `${unpaid} unpaid` : null,
        toMake > 0 ? `${toMake} to fulfil` : null,
      ].filter(Boolean).join(', ') || 'All orders paid and shipped.';

  return (
    <StudioShell here="orders" studioName={who.studioName}>
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Orders</h1>
          <p className="q-page-subtitle">{said}</p>
        </div>
      </header>

      <OrderList orders={orders} />
    </div>
    </StudioShell>
  );
}
