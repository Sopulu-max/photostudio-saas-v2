import { redirect } from 'next/navigation';
import { readBoard } from '@/weave/jobs/actions';
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

  const board = await readBoard();
  const tallest = Math.max(1, ...board.map((c) => c.jobs.length));
  const live = board
    .filter((c) => c.turn !== 'done')
    .reduce((n, c) => n + c.jobs.length, 0);

  return (
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
  );
}
