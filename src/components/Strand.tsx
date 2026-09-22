import React from 'react';
import Link from 'next/link';
import { stageBadgeClass } from '@/components/stageBadge';
import { initialsFor } from '@/components/Sheet';
import type { SheetBooking } from '@/modules/bookings/interface';

/**
 * THE STRAND - one booking as one line (11-BOOKINGS_INFORMATION_ARCHITECTURE
 * §9.9). A booking is a process that grows edges over time; the strand
 * draws exactly that, across the three planes:
 *
 *   identity · intake points (client, package, date, agreement) · FOR
 *   (what it is for) · its dated facts on a ±30 day axis with NOW fixed ·
 *   the steps as the within-booking hierarchy (a bracket per package, a
 *   run per service, a point per step) · the figure and the stage.
 *
 * Every booking is the same line with different points filled in, so a
 * glance down a column reads one fact across every job and a glance along
 * a row reads one job entire. Empty is warm. Under it, the caption says
 * the current points in words. Pure: everything arrives decided on the row.
 */

const SPAN = 30; // days each side of now on the axis

const pct = (offset: number) => 50 + Math.max(-SPAN, Math.min(SPAN, offset)) * (50 / SPAN);
const pinned = (offset: number) => Math.abs(offset) > SPAN;

function sayOffset(offset: number, scheduledFor: string | null) {
  const d = scheduledFor ? new Date(scheduledFor) : null;
  if (offset === 0) return d ? `Today · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Today';
  return d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
}

/** The column key: drawn once above a run of strands, never per strand. */
export function StrandKey() {
  return (
    <div className="q-strand q-strand-key" aria-hidden="true">
      <span>booking</span>
      <span className="q-strand-intake"><span>client</span><span>pkg</span><span>date</span><span>agreed</span></span>
      <span>for</span>
      <span className="q-strand-axis-key"><span>−{SPAN}d</span><span className="q-strand-now-word">now</span><span>+{SPAN}d</span></span>
      <span>steps · package › service › step</span>
      <span className="q-strand-end">figure · stage</span>
    </div>
  );
}

export function StrandRow({ b, caption, href }: { b: SheetBooking; caption?: React.ReactNode; href?: string }) {
  const s = b.strand;
  const closed = b.band === 'closed';
  const point = (on: boolean) => <i className={on ? 'q-pt q-pt-full' : 'q-pt q-pt-empty'} />;
  return (
    <div className={['q-strand-row', s.figure.today ? 'q-strand-today' : '', closed ? 'q-strand-closed' : ''].filter(Boolean).join(' ')}>
      <Link href={href ?? `/bookings/${b.id}`} className="q-strand q-plain-link">
        <span className="q-strand-id">
          <span className="q-strand-face" aria-hidden="true">{initialsFor(b.clientName ?? b.title)}</span>
          <span className="q-strand-title">{b.title}</span>
        </span>

        <span className="q-strand-intake" title="client · package · date · agreement">
          {point(s.intake.client)}
          {point(s.intake.package)}
          {point(s.intake.date)}
          <i className={s.intake.agreement === 'agreed' ? 'q-pt q-pt-full' : s.intake.agreement === 'proposed' ? 'q-pt q-pt-half' : 'q-pt q-pt-empty'} title={s.intake.agreement === 'proposed' ? 'proposed · awaiting the client' : undefined} />
        </span>

        <span className="q-strand-for">
          {s.forValues.map((v) => <span key={v.id} className="q-for">{v.name}</span>)}
          {s.forOpen.map((d) => <span key={d.id} className="q-for q-for-open">{d.name}?</span>)}
          {s.forValues.length === 0 && s.forOpen.length === 0 && <span className="q-for-none">—</span>}
        </span>

        <span className={s.axis.session === null ? 'q-strand-axis q-strand-axis-undated' : 'q-strand-axis'}>
          <i className="q-strand-now" />
          {s.axis.occasions.map((o, i) => (
            <i key={`o${i}`} className="q-mark q-mark-occasion" style={{ '--q-x': pct(o.offset) } as React.CSSProperties} title={`${o.label}`} />
          ))}
          {s.axis.reminders.map((r, i) => (
            <i key={`r${i}`} className={r <= 0 ? 'q-mark q-mark-reminder q-mark-past' : 'q-mark q-mark-reminder'} style={{ '--q-x': pct(r) } as React.CSSProperties} title="reminder" />
          ))}
          {s.axis.session !== null && (
            <>
              <i className={s.figure.today ? 'q-mark q-mark-session q-mark-session-today' : pinned(s.axis.session) ? 'q-mark q-mark-session q-mark-pinned' : 'q-mark q-mark-session'} style={{ '--q-x': pct(s.axis.session) } as React.CSSProperties} />
              <span className="q-mark-label" style={{ '--q-x': pct(s.axis.session) } as React.CSSProperties}>{sayOffset(s.axis.session, b.scheduledFor)}</span>
            </>
          )}
        </span>

        <span className="q-strand-steps">
          {s.runs.length === 0 ? (
            <span className="q-strand-nosteps">{s.intake.package ? 'no steps defined' : 'no package, so no steps'}</span>
          ) : s.runs.map((run, i) => (
            <span key={i} className="q-run-bracket" title={run.packageName}>
              {run.services.map((svc, j) => (
                <span key={j} className="q-run" title={svc.name}>
                  {svc.steps.map((st, k) => <i key={k} className={`q-pt q-pt-${st.state}`} title={`${svc.name} · ${st.name}${st.who ? ` · ${st.who}` : st.state === 'open' ? ' · Unassigned' : ''}`} />)}
                </span>
              ))}
            </span>
          ))}
          {s.runs.length > 0 && <i className={`q-pt q-pt-close q-pt-close-${s.close}`} title={s.close === 'done' ? 'closed' : s.close === 'ready' ? 'complete · not yet closed' : 'the close'} />}
        </span>

        <span className="q-strand-end">
          {s.figure.text && <span className={['q-strand-fig', s.figure.warm ? 'q-strand-fig-warm' : '', s.figure.today ? 'q-strand-fig-today' : ''].filter(Boolean).join(' ')}>{s.figure.text}</span>}
          {b.stage && <span className={`q-badge ${stageBadgeClass(b.stage as any)}`}>{b.stage.name}</span>}
        </span>
      </Link>
      {caption && <div className="q-strand-caption">{caption}</div>}
    </div>
  );
}

/** The caption most surfaces want: crew, each service's position, the answers, obligations - in words. */
export function StrandCaption({ b, crew }: { b: SheetBooking; crew?: string[] }) {
  const s = b.strand;
  const positions = s.runs.flatMap((r) => r.services.map((svc) => ({ svc, cur: svc.steps.find((st) => st.state === 'current' || st.state === 'open') })));
  const parts: React.ReactNode[] = [];
  if (crew) parts.push(<span key="crew"><span className="q-strand-cap-key">Crew</span> {crew.length > 0 ? crew.join(' · ') : <span className="q-work-gap">No one on this booking yet</span>}</span>);
  for (const { svc, cur } of positions) {
    if (!cur) continue;
    parts.push(<span key={svc.name}>{svc.name} · {cur.name} · {cur.who ? cur.who : <span className="q-work-gap">Unassigned</span>}</span>);
  }
  if (s.close === 'ready') parts.push(<span key="ready">complete · <span className="q-work-gap">not yet closed</span></span>);
  for (const f of b.facts) parts.push(<span key={`f${f.label}`} className={f.kind === 'date' ? 'q-fact q-fact-date' : 'q-fact'}><span className="q-fact-label">{f.label}</span> {f.text}</span>);
  if (b.reminders) parts.push(<span key="rem" className="q-work-gap">reminder due</span>);
  if (parts.length === 0) return null;
  return <>{parts.map((p, i) => <React.Fragment key={i}>{i > 0 && <span className="q-strand-cap-sep"> · </span>}{p}</React.Fragment>)}</>;
}
