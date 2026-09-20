import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listWorkSheet, listWorkByPerson } from '@/modules/production/interface';
import type { OpenStep } from '@/modules/production/interface';
import { WorkPositions } from '@/components/WorkPositions';
import { initialsFor } from '@/components/Sheet';
import { ContactAvatar } from '@/components/ContactAvatar';
import { stageBadgeClass } from '@/components/stageBadge';

export const dynamic = 'force-dynamic';

/**
 * THE WORK, GLOBALLY - read two ways.
 *
 * BY JOB: every live booking with where it stands - its stage (the global
 * position) and, inside it, each package's services and where each one is
 * (the local positions), with who is on the current step or that nobody is.
 *
 * BY PERSON: the same rows turned around - everyone, with the steps they are
 * carrying, busiest first; and at the end the steps nobody is on, since the
 * sheet's job is to show where the studio is short before the day, not on it.
 *
 * Nothing on this page is stored anywhere; it is the tasks, read. The choice
 * of reading is the URL's (?by=person), not state.
 *
 * This replaced a "coming soon" card that promised a label-based system the
 * schema had already moved on from.
 */
export default async function TasksPage(props: { searchParams: Promise<{ by?: string }> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const { by } = await props.searchParams;
  const byPerson = by === 'person';
  const say = (d: string | null) => d
    ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : null;

  return (
    <div className="q-page">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Work</h1>
          <p className="q-page-subtitle">
            {byPerson ? 'Everyone, and what each is carrying.' : 'Every live job, and where each part of it stands.'}
          </p>
        </div>
        <nav className="q-seg" aria-label="Read the work by">
          <Link href="/tasks" className={byPerson ? 'q-seg-btn' : 'q-seg-btn q-seg-on'} aria-current={byPerson ? undefined : 'page'}>By job</Link>
          <Link href="/tasks?by=person" className={byPerson ? 'q-seg-btn q-seg-on' : 'q-seg-btn'} aria-current={byPerson ? 'page' : undefined}>By person</Link>
        </nav>
      </header>

      {byPerson ? <ByPerson say={say} /> : <ByJob say={say} />}
    </div>
  );
}

async function ByJob({ say }: { say: (d: string | null) => string | null }) {
  const rows = await listWorkSheet();
  const withWork = rows.filter((r) => r.work.total > 0);
  const without = rows.filter((r) => r.work.total === 0);
  return (
    <>
      {rows.length === 0 && <p className="q-empty">No live bookings.</p>}

      {withWork.length > 0 && (
        <div className="q-sheet">
          {withWork.map((r) => (
            <div key={r.bookingId} className="q-sheet-row">
              <span className="q-sheet-frame" aria-hidden="true">{initialsFor(r.clientName ?? r.title)}</span>
              <span className="q-sheet-body">
                <span className="q-row q-row-sm" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Link href={`/bookings/${r.bookingId}`} className="q-sheet-name q-plain-link">{r.title}</Link>
                  {r.stage && <span className={`q-badge ${stageBadgeClass(r.stage as any)}`}>{r.stage.name}</span>}
                  {say(r.scheduledFor) && <span className="q-meta-sm">{say(r.scheduledFor)}</span>}
                </span>
                <WorkPositions work={r.work} compact />
              </span>
              <span className="q-sheet-side">
                <span className={r.work.allDone ? 'q-sheet-fig' : 'q-sheet-fig q-sheet-fig-none'}>
                  {r.work.allDone ? 'All done' : `${r.work.done} of ${r.work.total}`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {without.length > 0 && (
        <section className={withWork.length > 0 ? 'q-section-gap' : undefined}>
          <h2 className="q-section-title">No work yet</h2>
          <p className="q-meta" style={{ marginBottom: '12px' }}>Live bookings whose packages define no tasks, or that have none yet.</p>
          <div className="q-sheet">
            {without.map((r) => (
              <div key={r.bookingId} className="q-sheet-row q-sheet-row-dim">
                <span className="q-sheet-frame" aria-hidden="true">{initialsFor(r.clientName ?? r.title)}</span>
                <span className="q-sheet-body">
                  <span className="q-row q-row-sm" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <Link href={`/bookings/${r.bookingId}`} className="q-sheet-name q-plain-link">{r.title}</Link>
                    {r.stage && <span className={`q-badge ${stageBadgeClass(r.stage as any)}`}>{r.stage.name}</span>}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

async function ByPerson({ say }: { say: (d: string | null) => string | null }) {
  const { people, unstaffed } = await listWorkByPerson();
  const Steps = ({ steps }: { steps: OpenStep[] }) => (
    <span className="q-work q-work-compact" style={{ marginTop: '4px' }}>
      <span className="q-work-services">
        {steps.map((s) => (
          <Link key={s.id} href={`/bookings/${s.bookingId}`} className="q-work-service q-plain-link">
            <span className="q-work-name">{s.name}</span>
            <span className="q-work-pos">
              {s.fromService ? `${s.fromService} · ` : ''}{s.clientName ?? s.bookingTitle}
              {say(s.scheduledFor) && <span className="q-work-count"> · {say(s.scheduledFor)}</span>}
            </span>
          </Link>
        ))}
      </span>
    </span>
  );
  return (
    <>
      {people.length === 0 && <p className="q-empty">No one on the team yet.</p>}

      {people.length > 0 && (
        <div className="q-sheet">
          {people.map((p) => (
            <div key={p.employeeId} className={p.open.length === 0 && p.jobs === 0 ? 'q-sheet-row q-sheet-row-dim' : 'q-sheet-row'}>
              <span className="q-sheet-frame" aria-hidden="true">
                {p.avatarUrl ? <ContactAvatar name={p.name} url={p.avatarUrl} size="sm" /> : initialsFor(p.name)}
              </span>
              <span className="q-sheet-body">
                <span className="q-row q-row-sm" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Link href={`/team/${p.employeeId}`} className="q-sheet-name q-plain-link">{p.name}</Link>
                  {p.roles.map((r) => <span key={r} className="q-badge q-badge-neutral">{r}</span>)}
                </span>
                {p.open.length > 0 ? <Steps steps={p.open} /> : <span className="q-meta-sm">Nothing open.</span>}
              </span>
              <span className="q-sheet-side">
                <span className={p.open.length > 0 ? 'q-sheet-fig' : 'q-sheet-fig q-sheet-fig-none'}>
                  {p.open.length > 0 ? `${p.open.length} open` : '—'}
                </span>
                {p.jobs > 0 && <span className="q-meta-sm" style={{ display: 'block' }}>{p.jobs} {p.jobs === 1 ? 'job' : 'jobs'}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <section className="q-section-gap">
        <h2 className="q-section-title">Nobody on it</h2>
        <p className="q-meta" style={{ marginBottom: '12px' }}>
          {unstaffed.length === 0
            ? 'Every open step on a live booking has someone on it.'
            : `${unstaffed.length} open ${unstaffed.length === 1 ? 'step' : 'steps'} with no one on ${unstaffed.length === 1 ? 'it' : 'them'}. Put someone on the booking's crew in the role and its steps are taken.`}
        </p>
        {unstaffed.length > 0 && (
          <div className="q-sheet">
            {Object.entries(unstaffed.reduce<Record<string, OpenStep[]>>((acc, s) => {
              (acc[s.roleName ?? 'No role set'] ??= []).push(s);
              return acc;
            }, {})).map(([role, steps]) => (
              <div key={role} className="q-sheet-row">
                <span className="q-sheet-frame" aria-hidden="true">{initialsFor(role)}</span>
                <span className="q-sheet-body">
                  <span className="q-sheet-name">{role}</span>
                  <Steps steps={steps} />
                </span>
                <span className="q-sheet-side">
                  <span className="q-sheet-fig q-sheet-fig-none">{steps.length} open</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
