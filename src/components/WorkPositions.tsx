import React from 'react';
import type { BookingWork } from '@/modules/production/interface';

/**
 * Where the work is, locally: each package on the booking, each service in
 * it, its position. "Event Videography · done" beside "Event Photography ·
 * Colorgrade · 1 of 3 · Clifford". A reading of the tasks, drawn above the
 * list of them, so the job's shape is seen before its steps are.
 */
export function WorkPositions({ work, compact = false }: { work: BookingWork; compact?: boolean }) {
  if (work.total === 0) return null;
  return (
    <div className={compact ? 'q-work q-work-compact' : 'q-work'}>
      {work.lines.map((line) => (
        <div key={line.lineId ?? 'own'} className="q-work-line">
          {!compact && work.lines.length > 1 && <span className="q-print-from">{line.packageName}</span>}
          <div className="q-work-services">
            {line.services.map((s) => (
              <span key={`${line.lineId}:${s.packageServiceId}`} className={s.isDone ? 'q-work-service q-work-done' : 'q-work-service'}>
                <span className="q-work-name">{s.serviceName}</span>
                <span className="q-work-pos">
                  {s.isDone
                    ? 'Done'
                    : <>{s.current?.name}<span className="q-work-count"> · {s.done + 1} of {s.total}</span>
                        {/* Who is on it - or that nobody is, which is the thing to see. */}
                        <span className={s.current?.assignee ? 'q-work-who' : 'q-work-who q-work-gap'}> · {s.current?.assignee ?? 'nobody'}</span></>}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
