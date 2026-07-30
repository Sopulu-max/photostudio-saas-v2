'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateServiceQuestions } from '@/modules/services/interface';
import { FIELD_TYPE_LIST, fieldType, type IntakeQuestion } from '@/modules/services/fieldTypes';

/**
 * What a service asks a client. Edited locally and saved in one go — the whole
 * set is rewritten together, so adding, reordering and removing are one action.
 *
 * A question whose type is locked has already been answered by a client;
 * changing it would corrupt what they told you.
 */
export function QuestionEditor({
  serviceId,
  questions: initial,
  lockedIds,
}: {
  serviceId: string;
  questions: IntakeQuestion[];
  lockedIds: string[];
}) {
  const [questions, setQuestions] = useState<IntakeQuestion[]>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const locked = new Set(lockedIds);
  const dirty = JSON.stringify(questions) !== JSON.stringify(initial);

  const patch = (id: string, updates: Partial<IntakeQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...updates } : q)));

  const add = () =>
    setQuestions((qs) => [
      ...qs,
      { id: crypto.randomUUID(), type: 'text', label: '', required: false },
    ]);

  const remove = (id: string) => setQuestions((qs) => qs.filter((q) => q.id !== id));

  const move = (id: string, dir: -1 | 1) =>
    setQuestions((qs) => {
      const i = qs.findIndex((q) => q.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = () =>
    startTransition(async () => {
      try {
        await updateServiceQuestions({ serviceId, questions });
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Could not save the questions.');
      }
    });

  return (
    <div className="q-stack q-stack-md">
      {questions.length === 0 && (
        <p className="q-empty">
          No questions yet. Name, email and phone are always collected — add anything else you need to know.
        </p>
      )}

      {questions.map((q, i) => {
        const def = fieldType(q.type);
        const isLocked = locked.has(q.id);
        return (
          <div key={q.id} className="q-tile q-stack q-stack-sm">
            <div className="q-row">
              <input
                className="q-input q-fill"
                placeholder="What do you want to ask? e.g. Event date"
                value={q.label}
                onChange={(e) => patch(q.id, { label: e.target.value })}
              />
              <select
                className="q-select"
                value={q.type}
                disabled={isLocked}
                title={isLocked ? 'A client has answered this — type is locked' : undefined}
                onChange={(e) => patch(q.id, { type: e.target.value as any, options: undefined })}
                style={{ minWidth: '10rem' }}
              >
                {FIELD_TYPE_LIST.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="q-row">
              <span className="q-meta-sm">{def.hint}</span>
              <span className="q-spacer" />
              <label className="q-row q-meta-plain" style={{ gap: '6px' }}>
                <input type="checkbox" checked={!!q.required} onChange={(e) => patch(q.id, { required: e.target.checked })} />
                Required
              </label>
              <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => move(q.id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => move(q.id, 1)} disabled={i === questions.length - 1} aria-label="Move down">↓</button>
              <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => remove(q.id)}>Remove</button>
            </div>

            {def.needsOptions && (
              <input
                className="q-input"
                placeholder="Choices, comma separated — e.g. Indoor, Outdoor, Both"
                value={(q.options || []).join(', ')}
                onChange={(e) => patch(q.id, { options: e.target.value.split(',').map((o) => o.trim()) })}
              />
            )}

            {isLocked && (
              <span className="q-meta-sm">
                A client has already answered this, so its type is fixed. You can still rename it or make it optional.
              </span>
            )}
          </div>
        );
      })}

      <div className="q-row">
        <button className="q-btn q-btn-secondary" onClick={add}>+ Add question</button>
        <span className="q-spacer" />
        {dirty && (
          <>
            <button className="q-btn q-btn-primary" onClick={save} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save questions'}
            </button>
            <button className="q-btn q-btn-secondary" onClick={() => setQuestions(initial)} disabled={isPending}>
              Cancel
            </button>
          </>
        )}
      </div>

      <span className="q-meta-sm">
        Removing a question doesn&rsquo;t erase answers already given — past bookings keep what the client told you.
      </span>
    </div>
  );
}
