'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { moveJob } from '@/weave/jobs/actions';
import type { Board, JobCard, Turn } from '@/weave/jobs/shape';
import { sayWhen, type Occasion } from '@/weave/occasions/shape';
import { markOrder } from '@/weave/store/actions';
import { sayOrder, standingOf, type Order } from '@/weave/store/shape';

type NextMove = { label: string; turn: Turn };

function nextMoves(job: JobCard): NextMove[] {
  if (job.turn === 'us') return [{ label: 'Waiting on client', turn: 'them' }, { label: 'Mark done', turn: 'done' }];
  if (job.turn === 'them') return [{ label: 'Bring back to us', turn: 'us' }];
  if (job.turn === 'scheduled') return [{ label: 'Start work', turn: 'us' }];
  return [{ label: 'Reopen', turn: 'us' }];
}

/** The actual mobile controls: a few large, named actions over the shared data. */
export function MobileToday({ board, occasions, orders }: {
  board: Board; occasions: Occasion[]; orders: Order[];
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();
  const jobs = board.filter((column) => column.turn !== 'done').flatMap((column) => column.jobs);
  const run = (action: () => Promise<void>) => {
    setProblem(null);
    start(async () => {
      try { await action(); } catch (error) { setProblem(error instanceof Error ? error.message : 'That did not work'); }
    });
  };

  return (
    <div className="q-mobile-body q-stack q-stack-lg">
      <section className="q-stack q-stack-sm">
        <div className="q-row q-row-between"><h2 className="q-section-title">Needs a move</h2><span className="q-meta-sm">{jobs.length}</span></div>
        {jobs.length === 0 ? <p className="q-empty">Nothing open right now.</p> : jobs.map((job) => (
          <article className="q-mobile-item" key={job.id}>
            <Link href={`/jobs/${job.id}`} className="q-plain-link q-stack q-stack-xs">
              <strong className="q-card-name">{job.clientName ?? 'Unassigned job'}</strong>
              <span className="q-meta">{job.wants ?? 'No brief written yet'}</span>
              <span className="q-meta-sm">{board.find((column) => column.turn === job.turn)?.heading}{job.expectedOn ? ` · ${job.expectedOn}` : ''}</span>
            </Link>
            <div className="q-mobile-actions">
              {nextMoves(job).map((move) => <button key={move.turn} type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={working}
                onClick={() => run(() => moveJob({ jobId: job.id, turn: move.turn }))}>{move.label}</button>)}
            </div>
          </article>
        ))}
      </section>

      <section className="q-stack q-stack-sm">
        <div className="q-row q-row-between"><h2 className="q-section-title">On today</h2><span className="q-meta-sm">{occasions.length}</span></div>
        {occasions.length === 0 ? <p className="q-empty">No occasion recorded for today.</p> : occasions.map((occasion) => (
          <article key={occasion.id} className="q-mobile-item"><strong className="q-text-body">{occasion.what ?? 'An occasion'}</strong><span className="q-meta">{sayWhen(occasion)}</span></article>
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
