'use client';

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
    : 'No date yet';

  return (
    <div className="q-card" style={{ opacity: working ? 0.5 : 1 }}>
      <strong className="q-card-name">{job.clientName ?? 'Nobody named yet'}</strong>
      <span className="q-card-what">{job.wants ?? 'Nothing written down yet'}</span>
      <span className="q-card-when">{when}</span>
      <select
        className="q-input q-input-sm"
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
