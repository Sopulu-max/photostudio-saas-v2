import { redirect } from 'next/navigation';
import { StudioShell } from './StudioShell';
import { readBoard } from '@/weave/jobs/actions';
import { occasionsBetween } from '@/weave/occasions/actions';
import { sayWhen, sayCrew } from '@/weave/occasions/shape';
import { whoIsAsking } from '@/weave/studio';
import { NewJob } from './NewJob';
import { JobCardRow } from './JobCardRow';

/**
 * The board — the only screen that has to exist.
 *
 * Four columns, grouped by whose move it is. Not by production stage: most of a
 * studio's waiting belongs to somebody else, and the day's real load is what
 * sits in the first column.
 */
export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const today = new Date().toLocaleDateString('en-CA');
  const [board, todays] = await Promise.all([readBoard(), occasionsBetween(today, today)]);
  const tallest = Math.max(1, ...board.map((c) => c.jobs.length));
  const live = board
    .filter((c) => c.turn !== 'done')
    .reduce((n, c) => n + c.jobs.length, 0);

  return (
    <StudioShell here="board" studioName={who.studioName}>
    <div className="q-page">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">The board</h1>
          <p className="q-page-subtitle">
            {live === 0
              ? 'No job is open.'
              : `${live} ${live === 1 ? 'job is' : 'jobs are'} open.`}
          </p>
        </div>
      </header>

      {/*
        * Today, above the board.
        *
        * The board answers what is outstanding; this answers what is actually
        * on, which is the first thing anybody opening this at eight in the
        * morning wants. Said even when empty, because "nothing is on today" is
        * a fact worth knowing and a blank space is not.
        */}
      <section className="q-card q-stack q-stack-sm">
        <h2 className="q-section-title">Today</h2>
        {todays.length === 0 ? (
          <p className="q-empty">Nothing is happening today.</p>
        ) : (
          todays.map((o) => (
            <div key={o.id} className="q-row q-row-between">
              <span className="q-text-body">
                {o.what ?? 'Not said what it is'} &middot; {sayWhen(o)}
              </span>
              <span className={o.crew.length === 0 ? 'q-meta q-warm' : 'q-meta'}>
                {sayCrew(o)}
              </span>
            </div>
          ))
        )}
      </section>

      <NewJob />

      <div className="q-board">
        <div className="q-board-cols">
          {board.map((col) => (
            <section key={col.turn} className="q-board-col">
              <div className="q-board-head">
                <span className="q-board-head-top">
                  <span className="q-board-word">{col.heading}</span>
                  <b className="q-board-n">{col.jobs.length}</b>
                </span>
                <span className="q-board-weight">
                  <i style={{ ['--q-share' as string]: Math.round((col.jobs.length / tallest) * 100) }} />
                </span>
              </div>

              <div className="q-board-stack">
                {col.jobs.length === 0
                  ? <p className="q-empty">{col.absent}</p>
                  : col.jobs.map((job) => <JobCardRow key={job.id} job={job} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
    </StudioShell>
  );
}
