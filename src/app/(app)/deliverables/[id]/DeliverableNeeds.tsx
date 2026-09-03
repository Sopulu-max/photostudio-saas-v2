'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  declareDeliverableVariable, removeDeliverableVariable,
} from '@/modules/deliverables/interface';
import { DeclaredQuestions, type DeclaredQuestion } from '@/components/DeclaredQuestions';
import { toast, readableError } from '@/components/Toast';

/**
 * What this deliverable needs settling, on the deliverable itself.
 *
 * The same control the create page uses, with the other lifecycle: there the
 * questions are collected and written once the row exists, here each change is
 * saved as it is made. That is a difference about who owns the state, not about
 * what the thing looks like — so DeclaredQuestions owns neither, and there is
 * one of these rather than two spellings of one idea.
 *
 * A VARIABLE, NOT A SHAPE INVENTED FOR THIS SCREEN. This page first stored the
 * fields in a jsonb column with a shape I made up: three field types against
 * the eight the real one checks, no unit, no bounds, no default, and no share
 * of the one parser. The app already had the real mechanism — a variable with
 * an owner, which is now a service, a classification, or a deliverable — and
 * everything downstream already knew how to fix one on a package, ask a client
 * for it, or store the answer against a booking line.
 */
export function DeliverableNeeds({
  deliverableId,
  variables,
}: {
  deliverableId: string;
  variables: { id: string; label: string; kind: string; unit: string | null; options: string[] }[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const current: DeclaredQuestion[] = variables.map((v) => ({
    id: v.id, label: v.label, kind: v.kind, unit: v.unit, options: v.options,
  }));

  /*
   * The list comes back whole, so what changed is derived rather than reported.
   *
   * One added has no id; one removed is an id that has gone. Editing an
   * existing question is not offered here — a question already answered on
   * packages cannot quietly become a different question — so those are the only
   * two cases to find.
   */
  const apply = (next: DeclaredQuestion[]) => {
    const added = next.filter((q) => !q.id);
    const removed = current.filter((q) => q.id && !next.some((n) => n.id === q.id));

    startTransition(async () => {
      try {
        for (const q of added) {
          await declareDeliverableVariable({
            deliverableId,
            variable: { label: q.label, kind: q.kind, unit: q.unit, options: q.options },
          });
        }
        for (const q of removed) {
          await removeDeliverableVariable(q.id!);
        }
        router.refresh();
      } catch (e) {
        toast.bad(readableError(e, 'That could not be saved.'));
        router.refresh();
      }
    });
  };

  return <DeclaredQuestions questions={current} onChange={apply} disabled={isPending} />;
}
