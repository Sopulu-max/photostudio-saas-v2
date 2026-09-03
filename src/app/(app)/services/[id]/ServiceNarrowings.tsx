'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setServiceDeliverableOptions } from '@/modules/deliverables/interface';
import { toast, readableError } from '@/components/Toast';

/**
 * WHAT THIS SERVICE ACTUALLY DOES, OF WHAT ITS OUTPUTS ALLOW.
 *
 * A deliverable declares the possibilities — edited photographs may be softcopy
 * or hardcopy. A service is often narrower: Digital Retouching produces edited
 * photographs and only ever as softcopy. That is a fact about the WORK, not
 * about how any package sells it, and there was nowhere to say it.
 *
 * possibility → restriction → fact. The deliverable declares, the service
 * narrows, the package fixes one or leaves the client to choose from what is
 * left. This is the middle step, and without it every package bundling a
 * digital-only service had to be trusted to pick softcopy — and a client left
 * to choose could pick hardcopy from a service that does not print.
 *
 * NOTHING TICKED MEANS NO NARROWING, not "permits nothing". A service that
 * permitted no answer could never be sold, and clearing every box is what an
 * operator does when they mean "it does both again". Ticking every box is the
 * same statement, and is stored as no narrowing rather than as a restriction
 * that restricts nothing.
 */
export function ServiceNarrowings({
  capabilities,
}: {
  capabilities: {
    serviceDeliverableId: string;
    deliverableName: string;
    questions: { id: string; label: string; options: string[]; permitted: string[] }[];
  }[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, string[]>>({});

  const permittedFor = (capId: string, q: { id: string; permitted: string[] }) =>
    local[`${capId}:${q.id}`] ?? q.permitted;

  const toggle = (capId: string, q: { id: string; options: string[]; permitted: string[] }, value: string) => {
    const key = `${capId}:${q.id}`;
    const current = permittedFor(capId, q);
    // No narrowing reads as "all of them", so the first click has to start from
    // everything and take one away — not from nothing and add one.
    const base = current.length === 0 ? q.options : current;
    const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value];
    setLocal((prev) => ({ ...prev, [key]: next }));

    startTransition(async () => {
      try {
        await setServiceDeliverableOptions({
          serviceDeliverableId: capId, variableId: q.id, values: next,
        });
        router.refresh();
      } catch (e) {
        setLocal((prev) => ({ ...prev, [key]: current }));
        toast.bad(readableError(e, 'That could not be saved.'));
      }
    });
  };

  const withQuestions = capabilities.filter((c) => c.questions.length > 0);
  if (withQuestions.length === 0) return null;

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid var(--q-color-border)', paddingTop: '16px' }}>
      <label className="q-label" style={{ marginBottom: '4px' }}>What this service does of it</label>
      <p className="q-meta-sm" style={{ marginBottom: '12px' }}>
        These outputs ask something. Where this service only ever does some of the answers, say so —
        packages and clients will then only be offered those.
      </p>

      <div className="q-stack q-stack-sm">
        {withQuestions.map((c) => (
          <div key={c.serviceDeliverableId} className="q-tile q-stack q-stack-sm">
            <strong className="q-strong">{c.deliverableName}</strong>
            {c.questions.map((q) => {
              const permitted = permittedFor(c.serviceDeliverableId, q);
              const narrowed = permitted.length > 0 && permitted.length < q.options.length;
              return (
                <div key={q.id} className="q-stack q-stack-sm">
                  <span className="q-meta">
                    {q.label}
                    {!narrowed && <span className="q-meta-sm"> · does all of them</span>}
                  </span>
                  <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                    {q.options.map((o) => {
                      const on = permitted.length === 0 || permitted.includes(o);
                      return (
                        <button
                          key={o}
                          type="button"
                          disabled={isPending}
                          className={on ? 'q-badge q-badge-success' : 'q-badge q-badge-neutral'}
                          style={{ cursor: 'pointer', opacity: on ? 1 : 0.55 }}
                          title={on ? `${o} — click to say this service does not do it` : `${o} — click to allow it`}
                          onClick={() => toggle(c.serviceDeliverableId, q, o)}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
