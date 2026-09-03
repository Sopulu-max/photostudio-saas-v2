'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setServiceDeliverableOptions } from '@/modules/deliverables/interface';
import { toast, readableError } from '@/components/Toast';

type Question = { id: string; label: string; options: string[]; permitted: string[] };
type Inherited = {
  serviceDeliverableId: string | null;
  unit: string | null;
  questions: Question[];
};

/**
 * WHAT A CHOSEN DELIVERABLE BRINGS WITH IT.
 *
 * Picking "Edited Photographs" for a service used to add a word to a list and
 * say nothing else. But a deliverable is a kind that declares its own shape:
 * the unit it is counted in, and the questions every package promising it has
 * to settle. A service INHERITS that — it does not restate it — and this is
 * where choosing one stops being a word.
 *
 * AND WHERE THE SERVICE NARROWS IT. "Edited Photographs may be softcopy or
 * hardcopy" is the deliverable talking. "Digital Retouching only ever does
 * softcopy" is this service talking, about this deliverable — so it belongs on
 * the deliverable rather than in a settings block further down the page, which
 * is where I first put it and where it read as unrelated.
 *
 * possibility → restriction → fact: the kind declares, the service narrows, a
 * package fixes one or leaves the client to choose from what is left.
 */
export function DeliverableStructure({
  chosen,
  inherits,
  disabled,
}: {
  chosen: string[];
  inherits?: Record<string, Inherited>;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, string[]>>({});

  if (!inherits) return null;

  // Only what is actually chosen, and only what has something to say.
  const carrying = [...new Set(chosen)]
    .map((name) => ({ name, it: inherits[name] }))
    .filter((r) => r.it && (r.it.questions.length > 0 || r.it.unit));

  if (carrying.length === 0) return null;

  const permittedFor = (capId: string, q: Question) => local[`${capId}:${q.id}`] ?? q.permitted;

  const toggle = (capId: string, q: Question, value: string) => {
    const key = `${capId}:${q.id}`;
    const current = permittedFor(capId, q);
    // No narrowing means "all of them", so the first click starts from
    // everything and takes one away — not from nothing and adds one.
    const base = current.length === 0 ? q.options : current;
    const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
    setLocal((prev) => ({ ...prev, [key]: next }));

    startTransition(async () => {
      try {
        await setServiceDeliverableOptions({ serviceDeliverableId: capId, variableId: q.id, values: next });
        router.refresh();
      } catch (e) {
        setLocal((prev) => ({ ...prev, [key]: current }));
        toast.bad(readableError(e, 'That could not be saved.'));
      }
    });
  };

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid var(--q-color-border)', paddingTop: '16px' }}>
      <label className="q-label" style={{ marginBottom: '4px' }}>What these bring with them</label>
      <p className="q-meta-sm" style={{ marginBottom: '12px' }}>
        Declared once on the deliverable, inherited by every service that produces it. Where this
        service only ever does some of the answers, say so — packages and clients are then offered
        only those.
      </p>

      <div className="q-stack q-stack-sm">
        {carrying.map(({ name, it }) => (
          <div key={name} className="q-tile q-stack q-stack-sm">
            <div className="q-row q-row-between">
              <strong className="q-strong">{name}</strong>
              {it!.unit && <span className="q-meta-sm">counted in {it!.unit}s</span>}
            </div>

            {it!.questions.length === 0 && (
              <span className="q-meta-sm">Nothing to settle about it.</span>
            )}

            {it!.questions.map((q) => {
              const narrowable = q.options.length > 1 && it!.serviceDeliverableId;
              const permitted = it!.serviceDeliverableId
                ? permittedFor(it!.serviceDeliverableId, q)
                : q.permitted;
              const narrowed = permitted.length > 0 && permitted.length < q.options.length;

              return (
                <div key={q.id} className="q-stack q-stack-sm">
                  <span className="q-meta">
                    {q.label}
                    {q.options.length === 0 && <span className="q-meta-sm"> · answered per package</span>}
                    {q.options.length > 1 && !narrowed && (
                      <span className="q-meta-sm"> · this service does all of them</span>
                    )}
                  </span>

                  {q.options.length > 0 && (
                    <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                      {q.options.map((o) => {
                        const on = permitted.length === 0 || permitted.includes(o);
                        return narrowable ? (
                          <button
                            key={o}
                            type="button"
                            disabled={disabled || isPending}
                            className={on ? 'q-badge q-badge-success' : 'q-badge q-badge-neutral'}
                            style={{ cursor: 'pointer', opacity: on ? 1 : 0.55 }}
                            title={on
                              ? `${o} — click to say this service does not do it`
                              : `${o} — click to allow it`}
                            onClick={() => toggle(it!.serviceDeliverableId!, q, o)}
                          >
                            {o}
                          </button>
                        ) : (
                          <span key={o} className="q-badge q-badge-neutral">{o}</span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/*
              * A narrowing hangs off the row joining this service to this
              * deliverable, and that row does not exist until the service has
              * been saved with it on. Said plainly rather than showing controls
              * that would fail.
              */}
            {!it!.serviceDeliverableId && it!.questions.some((q) => q.options.length > 1) && (
              <span className="q-meta-sm">
                Save the service and you can say which of these it actually does.
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
