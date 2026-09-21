'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LineQuestions, hasQuestions, type OpenQuestions } from '../../LineQuestions';
import { setBookingClassification, setBookingIntakeAnswers, setLineConfiguration } from '@/modules/bookings/interface';
import { parseVariableValue } from '@/modules/services/variableTypes';
import { toast, readableError } from '@/components/Toast';

/**
 * The questions a package left open, answered in place on the booking.
 *
 * The same list the new-booking form asks, under the same package - held
 * here as a draft and written when saved, since three different records
 * answer it: the booking's classification, the booking's intake answers, and
 * the line's variable values. Each is written only where it changed.
 */
export function LineQuestionsEditor({
  bookingId,
  lineId,
  packageId,
  questions,
  classification,
  intake,
  answers,
}: {
  bookingId: string;
  lineId: string;
  packageId: string;
  questions: OpenQuestions;
  classification: Record<string, string>;
  intake: Record<string, any>;
  answers: Record<string, string>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [c, setC] = useState(classification);
  const [i, setI] = useState(intake);
  const [a, setA] = useState(answers);

  if (!hasQuestions(questions)) return null;

  const changed = (x: Record<string, any>, y: Record<string, any>) =>
    Object.keys({ ...x, ...y }).filter((k) => String(x[k] ?? '') !== String(y[k] ?? ''));
  const dirty = changed(c, classification).length + changed(i, intake).length + changed(a, answers).length > 0;

  const save = () => startTransition(async () => {
    try {
      for (const dimensionId of changed(c, classification)) {
        await setBookingClassification({ bookingId, dimensionId, valueId: c[dimensionId] || null });
      }
      if (changed(i, intake).length > 0) {
        await setBookingIntakeAnswers({ bookingId, packageId, values: i });
      }
      const touched = changed(a, answers);
      if (touched.length > 0) {
        const write: { serviceVariableId: string; value: unknown }[] = [];
        const clear: string[] = [];
        for (const id of touched) {
          const raw = String(a[id] ?? '').trim();
          if (raw === '') { clear.push(id); continue; }
          const v = questions.variables.find((x: any) => x.id === id);
          const value = parseVariableValue((v?.kind ?? 'text') as any, raw);
          if (v?.kind === 'number') {
            if (typeof value !== 'number') { toast.bad(`${v.label} has to be a number.`); return; }
            if (v.min != null && value < v.min) { toast.bad(`${v.label} can't be below ${v.min}.`); return; }
            if (v.max != null && value > v.max) { toast.bad(`${v.label} can't be above ${v.max}.`); return; }
          }
          write.push({ serviceVariableId: id, value });
        }
        await setLineConfiguration({ bookingId, lineId, answers: write, clear, source: 'studio' });
      }
      router.refresh();
    } catch (e: any) {
      toast.bad(readableError(e, 'Those answers could not be saved.'));
    }
  });

  return (
    <div className="q-stack q-stack-md" style={{ marginTop: '12px' }}>
      <LineQuestions
        questions={questions}
        classification={c}
        intake={i}
        answers={a}
        onClassification={(d, v) => setC((prev) => ({ ...prev, [d]: v }))}
        onIntake={(id, v) => setI((prev) => ({ ...prev, [id]: v }))}
        onAnswer={(id, raw) => setA((prev) => ({ ...prev, [id]: raw }))}
      />
      {dirty && (
        <div className="q-row q-row-sm q-appear">
          <button type="button" className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending} onClick={save}>
            {isPending ? 'Saving…' : 'Save answers'}
          </button>
          <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={isPending}
            onClick={() => { setC(classification); setI(intake); setA(answers); }}>
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
