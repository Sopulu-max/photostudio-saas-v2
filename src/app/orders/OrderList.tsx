'use client';

import { useState, useTransition } from 'react';
import { markOrder } from '@/weave/store/actions';
import { money, orderTotal, sayOrder, standingOf, type Order } from '@/weave/store/shape';

/**
 * What was ordered, and what is left to do about it.
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
    return <p className="q-empty-lg">Nobody has ordered anything yet.</p>;
  }

  return (
    <div className="q-stack q-stack-sm">
      {orders.map((o) => {
        const standing = standingOf(o);
        return (
          <section key={o.id} className="q-card q-stack q-stack-xs">
            <div className="q-row q-row-between">
              <strong className="q-strong">{o.who ?? 'Somebody'}</strong>
              <span className={standing === 'done' ? 'q-meta' : 'q-meta q-warm'}>
                {sayOrder(o)}
              </span>
            </div>

            <span className="q-meta-sm">
              {new Date(o.placedAt).toLocaleString('en-GB', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>

            <div className="q-stack q-stack-xs">
              {o.lines.map((l) => (
                <div key={l.id} className="q-row q-row-between">
                  <span className="q-text-body">
                    {l.quantity > 1 ? `${l.quantity} × ` : ''}{l.name}
                    {l.variantName && <span className="q-meta"> · {l.variantName}</span>}
                    {l.fileName && <span className="q-meta"> &middot; {l.fileName}</span>}
                  </span>
                  <span className="q-num">{money(l.unitPrice * l.quantity, o.currency)}</span>
                </div>
              ))}
              <div className="q-row q-row-between">
                <span className="q-strong">Total</span>
                <strong className="q-num">{money(orderTotal(o.lines), o.currency)}</strong>
              </div>
            </div>

            {o.shipTo && <span className="q-meta">Send to: {o.shipTo}</span>}
            {o.note && <span className="q-meta">They said: {o.note}</span>}

            <div className="q-row q-row-sm">
              <button
                type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                onClick={() => run(() => markOrder({ orderId: o.id, paid: !o.paidAt }))}
              >
                {o.paidAt ? 'Not paid after all' : 'Mark it paid'}
              </button>
              <button
                type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                onClick={() => run(() => markOrder({ orderId: o.id, fulfilled: !o.fulfilledAt }))}
              >
                {o.fulfilledAt ? 'Not sent after all' : 'Mark it sent'}
              </button>
              {o.jobId && (
                <a className="q-btn q-btn-ghost q-btn-xs" href={`/jobs/${o.jobId}`}>The job</a>
              )}
            </div>
          </section>
        );
      })}

      {problem && <p className="q-meta">{problem}</p>}
    </div>
  );
}
