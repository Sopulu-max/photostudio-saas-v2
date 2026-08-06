'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setEnabledDimensions } from '@/modules/services/interface';
import type { Dimension } from '@/modules/services/interface';

const LABELS: Record<Dimension, { label: string; question: string; example: string }> = {
  subject: { label: 'Subject', question: 'What is being photographed?', example: 'Person, Product, Building' },
  occasion: { label: 'Occasion', question: 'What occasion is it for?', example: 'Wedding, Birthday' },
  context: { label: 'Context', question: 'Where, and under what conditions?', example: 'Studio, Outdoor' },
  purpose: { label: 'Purpose', question: 'What is it for?', example: 'Passport, Advertising, Editorial' },
  client: { label: 'Client', question: 'Who is the client?', example: 'Individual, Family, Corporate' },
};
const ALL: Dimension[] = ['subject', 'occasion', 'context', 'purpose', 'client'];

/**
 * Fashion Photography and Birthday Photography don't answer the same
 * question — one's a subject, one's an occasion. Collapsing every
 * distinguishing question into one shape forces every studio into the same
 * business. This is the studio's own choice of which questions matter to
 * them; the set of possible questions is closed, but which ones apply here
 * is entirely theirs — and it applies to both what a studio does (Service)
 * and what it sells (Package), which is why this lives in Services settings,
 * the layer both depend on.
 */
export function DimensionChooser({ enabled: initial }: { enabled: Dimension[] }) {
  const [enabled, setEnabled] = useState<Dimension[]>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = JSON.stringify([...enabled].sort()) !== JSON.stringify([...initial].sort());

  const toggle = (d: Dimension) =>
    setEnabled((es) => (es.includes(d) ? es.filter((x) => x !== d) : [...es, d]));

  const save = () =>
    startTransition(async () => {
      try { await setEnabledDimensions(enabled); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Could not save.'); }
    });

  return (
    <div className="q-stack q-stack-md">
      <div className="q-stack q-stack-sm">
        {ALL.map((d) => (
          <label key={d} className="q-tile q-row" style={{ gap: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled.includes(d)} onChange={() => toggle(d)} />
            <div>
              <strong className="q-strong">{LABELS[d].label}</strong>
              <div className="q-meta-sm">{LABELS[d].question} — e.g. {LABELS[d].example}</div>
            </div>
          </label>
        ))}
      </div>
      {dirty && (
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" onClick={save} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setEnabled(initial)} disabled={isPending}>Cancel</button>
        </div>
      )}
    </div>
  );
}
