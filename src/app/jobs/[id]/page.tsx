import { redirect, notFound } from 'next/navigation';
import { readJob } from '@/weave/jobs/actions';
import { whoIsAsking } from '@/weave/studio';
import { COLUMNS } from '@/weave/jobs/shape';
import { occasionsForJob, listPeople } from '@/weave/occasions/actions';
import { headers } from 'next/headers';
import { filesForJob } from '@/weave/files/actions';
import { galleriesForJob, galleryActivityForJob, galleryTemplates } from '@/weave/galleries/actions';
import { priceLists } from '@/weave/store/actions';
import { JobAmend } from './JobAmend';
import { Occasions } from './Occasions';
import { Files } from './Files';
import { Galleries } from './Galleries';
import { StudioNav } from '../../StudioNav';

export const dynamic = 'force-dynamic';

/**
 * One job.
 *
 * Everything the studio knows about it, and — underneath — everything that has
 * happened to it. The history is here from the first version rather than added
 * once something has already gone wrong, because the log is only useful if it
 * was running before you needed it.
 */

/** The log, as sentences. A reading that needs a key is not a reading. */
function say(action: string, payload: Record<string, unknown>): string {
  const heading = (turn: unknown) =>
    COLUMNS.find((c) => c.turn === turn)?.heading ?? String(turn);

  if (action === 'started') {
    return payload.client ? `Started for ${payload.client}` : 'Started';
  }
  if (action === 'turn_changed') {
    return `Moved from ${heading(payload.from)} to ${heading(payload.to)}`;
  }
  if (action === 'amended') {
    const changed: string[] = [];
    if ('wants' in payload) changed.push('what they want');
    if ('expected_on' in payload) changed.push('the date');
    return changed.length ? `Changed ${changed.join(' and ')}` : 'Changed';
  }
  return action.replace(/_/g, ' ');
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const { id } = await params;
  const job = await readJob(id);
  if (!job) notFound();

  /*
   * Asked together, not one after the other. Three sequential round trips to
   * draw one page is how an app starts feeling like a website, and none of
   * these three answers depends on another.
   */
  const [occasions, people, files, galleries, galleryActivity, templates, lists, head] = await Promise.all([
    occasionsForJob(id),
    listPeople(),
    filesForJob(id),
    galleriesForJob(id),
    galleryActivityForJob(id),
    galleryTemplates(),
    priceLists(),
    headers(),
  ]);

  // The address the studio is actually on, so a copied link works from wherever
  // this is being served rather than from a guess baked in at build time.
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const scheme = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${scheme}://${host}`;

  // Local calendar day, not UTC — "today" means the studio's today, and at
  // half past midnight in Lagos a UTC date is still yesterday.
  const today = new Date().toLocaleDateString('en-CA');

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">{job.clientName ?? 'Nobody named yet'}</h1>
          <p className="q-page-subtitle">
            {job.wants ?? 'Nothing written down about what they want yet.'}
          </p>
        </div>
        <StudioNav here="board" />
      </header>

      <JobAmend job={job} />

      <Occasions jobId={job.id} occasions={occasions} people={people} today={today} />

      <Files jobId={job.id} files={files} />

      <Galleries jobId={job.id} galleries={galleries} activity={galleryActivity} templates={templates} origin={origin} lists={lists} />

      <section className="q-card q-stack q-stack-sm">
        <h2 className="q-section-title">What has happened</h2>
        {job.history.length === 0 ? (
          <p className="q-empty">Nothing recorded yet.</p>
        ) : (
          job.history.map((e) => (
            <div key={e.id} className="q-row q-row-between">
              <span className="q-text-body">{say(e.action, e.payload ?? {})}</span>
              <span className="q-meta-sm">
                {new Date(e.at).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
