'use client';

import React from 'react';
import { VariableField } from '@/components/VariableField';
import { labelledByAnswer } from '@/kernel/classification';

/**
 * WHAT A PACKAGE LEFT OPEN, ASKED UNDER IT.
 *
 * A booking instantiates a package by answering what the package left open:
 * which occasion, the studio's own questions, the date and the rest. This
 * is that list, drawn once and used wherever a package sits on a booking -
 * the new-booking form, where the answers are the form's state until Save,
 * and the booking's edit page, where they are the line's and save in place.
 *
 * It used to live inline in the new-booking form only. The edit page then
 * split the same questions three ways - variables on the line behind
 * Change, the occasion in a booking-wide section offering every value the
 * studio has, the intake questions nowhere - so what was one list at
 * creation could not be found again afterwards.
 *
 * Which occasion comes first, because some of what follows depends on it:
 * the date of the occasion means nothing until the occasion is settled.
 * Same order as the storefront, for the same reason.
 */

export type OpenQuestions = {
  variables: any[];
  classifications: any[];
  formSchema: any[];
};

export function hasQuestions(q: OpenQuestions | null | undefined): boolean {
  return Boolean(q && (q.variables.length > 0 || q.classifications.length > 0 || (q.formSchema || []).length > 0));
}

export function LineQuestions({
  questions,
  classification,
  intake,
  answers,
  onClassification,
  onIntake,
  onAnswer,
  scheduling,
}: {
  questions: OpenQuestions;
  /** The classification answers, by dimension id. */
  classification: Record<string, string>;
  /** The studio's own questions, by question id. */
  intake: Record<string, any>;
  /** The variables, by variable id, as typed. */
  answers: Record<string, string>;
  onClassification: (dimensionId: string, valueId: string) => void;
  onIntake: (questionId: string, value: any) => void;
  onAnswer: (variableId: string, raw: string) => void;
  /**
   * A DATE THE STUDIO KNOWS AND THE CALENDAR DOES NOT.
   *
   * The calendar reads bookings.scheduled_for and nothing else; the date of
   * the occasion lands in the line's answers, which the calendar never
   * touches. So the date of the wedding can be taken from the client and the
   * booking appear on no calendar, with nothing saying so.
   *
   * NOT FILLED IN AUTOMATICALLY, because these are two different facts:
   * scheduled_for is when the STUDIO works, and this is when the EVENT is.
   * Usually the same for event coverage and not always - a pre-wedding shoot
   * is before, an album after. So it is offered, beside the answer that was
   * just given. Given only where the form owns the schedule.
   */
  scheduling?: { when: string; setWhen: (v: string) => void };
}) {
  const q = questions;
  const schema = (q.formSchema || []) as any[];
  if (!hasQuestions(q)) return null;

  return (
    <>
      {q.classifications.map((c: any) => (
        <div className="q-field" key={c.dimensionId}>
          <label className="q-label">{c.question || c.name}</label>
          <select
            className="q-select"
            value={classification[c.dimensionId] || ''}
            onChange={(e) => onClassification(c.dimensionId, e.target.value)}
          >
            <option value="">Not said yet</option>
            {c.values.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      ))}

      {/*
        * THE STUDIO'S OWN QUESTIONS. Written on the package by whoever built
        * it; asked of clients booking online and of an operator taking the
        * same booking by phone alike.
        */}
      {schema.map((f: any) => (
        <div className="q-field" key={f.id}>
          <label className="q-label">
            {f.label}
            {f.required && <span className="q-danger" style={{ marginLeft: '4px' }}>*</span>}
          </label>
          {f.type === 'textarea' ? (
            <textarea
              className="q-textarea"
              rows={3}
              value={intake[f.id] ?? ''}
              onChange={(e) => onIntake(f.id, e.target.value)}
            />
          ) : f.type === 'select' ? (
            <select
              className="q-select"
              value={intake[f.id] ?? ''}
              onChange={(e) => onIntake(f.id, e.target.value)}
            >
              <option value="">Not said</option>
              {(f.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              className="q-input"
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              value={intake[f.id] ?? ''}
              onChange={(e) => onIntake(f.id, e.target.value)}
            />
          )}
        </div>
      ))}

      {q.variables.map((v: any) => (
        <div className="q-field" key={v.id}>
          <label className="q-label">
            {/*
              * NAMED BY THE ANSWER, ONCE THERE IS ONE. "Occasion Date" is what
              * the studio wrote, because when the question was declared the
              * occasion was not yet any particular one. Once this booking says
              * Birthday it is the birthday's date. The same kernel rule the
              * client's form uses, so the operator and the client never see
              * the same field called two things.
              */}
            {labelledByAnswer(
              v.label,
              v.dimensionName,
              (q.classifications as any[])
                .find((c: any) => c.dimensionId === v.dimensionId)
                ?.values?.find((x: any) => x.id === classification[v.dimensionId])
                ?.name,
            )}
            {v.unit && <span className="q-meta-sm" style={{ marginLeft: '6px' }}>({v.unit}s)</span>}
            {/* Where the question comes from: the classification it hangs
                off, else the service that declares it. */}
            {(v.dimensionName || v.serviceName) && (
              <span className="q-meta-sm" style={{ marginLeft: '8px' }}>
                &middot; {v.dimensionName || v.serviceName}
              </span>
            )}
          </label>
          <VariableField
            kind={v.kind}
            value={answers[v.id] ?? ''}
            onChange={(next) => onAnswer(v.id, Array.isArray(next) ? next.join(', ') : next)}
            options={v.options || []}
            unit={v.unit}
            min={v.min}
            max={v.max}
            emptyLabel="Not said yet"
            width="100%"
          />
          {scheduling && v.kind === 'date' && (answers[v.id] ?? '') !== '' && (() => {
            const said = String(answers[v.id]).slice(0, 10);
            const scheduled = scheduling.when ? scheduling.when.slice(0, 10) : '';
            const reads = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(undefined,
              { day: 'numeric', month: 'long', year: 'numeric' });
            if (!scheduled) {
              return (
                <span className="q-row q-row-sm q-appear" style={{ alignItems: 'center' }}>
                  <span className="q-meta-sm">This booking is not scheduled.</span>
                  <button type="button" className="q-btn q-btn-secondary q-btn-xs"
                    onClick={() => scheduling.setWhen(`${said}T09:00`)}>
                    Schedule it for {reads(said)}
                  </button>
                </span>
              );
            }
            if (scheduled !== said) {
              return (
                <span className="q-row q-row-sm q-appear" style={{ alignItems: 'center' }}>
                  <span className="q-meta-sm q-text-danger">
                    This booking is scheduled for {reads(scheduled)}.
                  </span>
                  <button type="button" className="q-btn q-btn-secondary q-btn-xs"
                    onClick={() => scheduling.setWhen(`${said}T${scheduling.when.slice(11) || '09:00'}`)}>
                    Move it to {reads(said)}
                  </button>
                </span>
              );
            }
            return null;
          })()}
        </div>
      ))}
    </>
  );
}
