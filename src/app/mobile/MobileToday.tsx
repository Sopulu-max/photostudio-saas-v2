'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { moveBooking } from '@/weave/bookings/actions';
import { sayOccasion, sayWhen, type Board, type BookingCard, type Turn } from '@/weave/bookings/shape';
import { markOrder } from '@/weave/store/actions';
import { sayOrder, standingOf, type Order } from '@/weave/store/shape';

type NextMove = { label: string; turn: Turn };

function nextMoves(booking: BookingCard): NextMove[] {
  if (booking.turn === 'us') return [{ label: 'Waiting on client', turn: 'them' }, { label: 'Mark done', turn: 'done' }];
  if (booking.turn === 'them') return [{ label: 'Bring back to us', turn: 'us' }];
  if (booking.turn === 'scheduled') return [{ label: 'Start work', turn: 'us' }];
  return [{ label: 'Reopen', turn: 'us' }];
}

/** The actual mobile controls: a few large, named actions over the shared data. */
export function MobileToday({ board, orders }: {
  board: Board; orders: Order[];
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();
  const bookings = board.filter((column) => column.turn !== 'done').flatMap((column) => column.bookings);
  const run = (action: () => Promise<void>) => {
    setProblem(null);
    start(async () => {
      try { await action(); } catch (error) { setProblem(error instanceof Error ? error.message : 'That did not work'); }
    });
  };

  return (
    <div className="q-mobile-body q-stack q-stack-lg">
      <section className="q-stack q-stack-sm">
        <div className="q-row q-row-between"><h2 className="q-section-title">Needs a move</h2><span className="q-meta-sm">{bookings.length}</span></div>
        {bookings.length === 0 ? <p className="q-empty">Nothing open right now.</p> : bookings.map((booking) => (
          <article className="q-mobile-item" key={booking.id}>
            <Link href={`/bookings/${booking.id}`} className="q-plain-link q-stack q-stack-xs">
              <strong className="q-card-name">{booking.clientName ?? 'Unassigned booking'}</strong>
              <span className="q-meta">{sayOccasion(booking.occasion, booking.occasionOn, booking.on) ?? booking.wants ?? 'No notes'}</span>
              <span className="q-meta-sm">{board.find((column) => column.turn === booking.turn)?.heading} · {sayWhen(booking.on, booking.at)}</span>
            </Link>
            <div className="q-mobile-actions">
              {nextMoves(booking).map((move) => <button key={move.turn} type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={working}
                onClick={() => run(() => moveBooking({ bookingId: booking.id, turn: move.turn }))}>{move.label}</button>)}
            </div>
          </article>
        ))}
      </section>

      <section className="q-stack q-stack-sm">
        <div className="q-row q-row-between"><h2 className="q-section-title">Orders to touch</h2><span className="q-meta-sm">{orders.length}</span></div>
        {orders.length === 0 ? <p className="q-empty">No orders need action.</p> : orders.map((order) => {
          const standing = standingOf(order);
          return <article key={order.id} className="q-mobile-item">
            <strong className="q-text-body">{order.who ?? 'A client'} <span className="q-meta">· {sayOrder(order)}</span></strong>
            <div className="q-mobile-actions">
              {standing === 'unpaid' && <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={working} onClick={() => run(() => markOrder({ orderId: order.id, paid: true }))}>Mark paid</button>}
              {standing === 'to make' && <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={working} onClick={() => run(() => markOrder({ orderId: order.id, fulfilled: true }))}>Mark sent</button>}
            </div>
          </article>;
        })}
      </section>
      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </div>
  );
}
