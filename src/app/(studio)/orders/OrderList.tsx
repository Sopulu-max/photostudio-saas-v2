'use client';

import { useState, useTransition } from 'react';
import { markOrder } from '@/weave/store/actions';
import { money, orderTotal, sayOrder, standingOf, type Order } from '@/weave/store/shape';

/**
 * What was ordered, and what is left to do about it.
 *
 * An order is a receipt, so it is set as one: the names on the left, the
 * figures ruled to the right edge in tabular numerals, the total under a line.
 * Nothing here is a form — the two marks a studio makes on an order wait until
 * the order is reached for, as they do on the board.
 *
 * Paid and made are marked by hand because no payment processor is wired - a
 * decision carried over deliberately, and how this studio already works. When
 * one arrives it writes the same column and nothing here changes.
 */
export function OrderList({ orders }: { orders: Order[] }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  if (orders.length === 0) {
    return <p className="q-empty-lg">No orders.</p>;
  }

  return (
    <div className="q-stack q-stack-md">
      {orders.map((o) => {
        const standing = standingOf(o);
        return (
          <article key={o.id} className="q-receipt" data-busy={working ? 'yes' : undefined}>
            <header className="q-receipt-head">
              <div className="q-receipt-who">
                <strong className="q-receipt-name">{o.who ?? 'Unnamed'}</strong>
                <span className="q-meta-sm">
                  {new Date(o.placedAt).toLocaleString('en-GB', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
              <span className={standing === 'done' ? 'q-standing' : 'q-standing q-standing-open'}>
                {sayOrder(o)}
              </span>
            </header>

            <div className="q-sheet">
              {o.lines.map((l) => (
                <div key={l.id} className="q-ware-head">
                  <span className="q-ware-name">
                    {l.quantity > 1 ? `${l.quantity} × ` : ''}{l.name}
                    {l.variantName && <span className="q-meta"> · {l.variantName}</span>}
                    {l.fileName && <span className="q-meta"> &middot; {l.fileName}</span>}
                  </span>
                  <span className="q-ware-rule" aria-hidden="true" />
                  <span className="q-num q-ware-price">
                    {money(l.unitPrice * l.quantity, o.currency)}
                  </span>
                </div>
              ))}
            </div>

            <div className="q-receipt-total">
              <span className="q-section-title">Total</span>
              <strong className="q-num q-receipt-sum">
                {money(orderTotal(o.lines), o.currency)}
              </strong>
            </div>

            {o.shipTo && <p className="q-meta">Ship to: {o.shipTo}</p>}
            {o.note && <p className="q-meta">Client note: {o.note}</p>}

            <div className="q-receipt-acts">
              <button
                type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                onClick={() => run(() => markOrder({ orderId: o.id, paid: !o.paidAt }))}
              >
                {o.paidAt ? 'Mark unpaid' : 'Mark paid'}
              </button>
              <button
                type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                onClick={() => run(() => markOrder({ orderId: o.id, fulfilled: !o.fulfilledAt }))}
              >
                {o.fulfilledAt ? 'Mark unshipped' : 'Mark shipped'}
              </button>
              {o.bookingId && (
                <a className="q-btn q-btn-ghost q-btn-xs" href={`/bookings/${o.bookingId}`}>View booking</a>
              )}
            </div>
          </article>
        );
      })}

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </div>
  );
}
