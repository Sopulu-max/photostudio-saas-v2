'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { moveJob } from '@/weave/jobs/actions';
import { COLUMNS, type JobCard } from '@/weave/jobs/shape';

/**
 * One job on the board.
 *
 * The card states itself — who it is for, what they asked for, when it is
 * expected — without labels, because a reading that needs a key is not a
 * reading. Where a fact is absent the card says so rather than leaving a gap,
 * since "no date yet" is something an operator needs to know and blank space
 * is not.
 */
export function JobCardRow({ job }: { job: JobCard }) {
  const [working, start] = useTransition();

  const move = (turn: string) => {
    start(async () => {
      try {
        await moveJob({ jobId: job.id, turn: turn as JobCard['turn'] });
      } catch (err) {
        console.error(err);
      }
    });
  };

  const when = job.expectedOn
    ? new Date(job.expectedOn + 'T00:00:00').toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short',
      })
    : 'No date set';

  return (
    <div className="q-card q-job" data-busy={working ? 'yes' : undefined}>
      <Link href={`/jobs/${job.id}`} className="q-plain-link q-stack q-stack-xs">
        <strong className="q-card-name">{job.clientName ?? 'Unnamed client'}</strong>
        <span className="q-card-what">{job.wants ?? 'No brief'}</span>
        <span className="q-card-when">{when}</span>
      </Link>

      {/*
        * Moving a job is occasional, so the control waits until the card is
        * reached for. A select sitting inside every card turned a board of
        * work into a page of form fields.
        */}
      <select
        className="q-job-move"
        value={job.turn}
        onChange={(e) => move(e.target.value)}
        disabled={working}
        aria-label={`Move ${job.clientName ?? 'this job'}`}
      >
        {COLUMNS.map((c) => (
          <option key={c.turn} value={c.turn}>{c.heading}</option>
        ))}
      </select>
    </div>
  );
}
