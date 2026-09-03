'use server';

import {
  createDeliverable, createDeliveryContainer, updateDeliverableConfig,
  declareDeliverableVariable,
} from '@/modules/deliverables/interface';

/**
 * Make a deliverable, and hand back where it now lives.
 *
 * The id comes back so the form can go TO the thing just made rather than to a
 * list of everything. A deliverable is rarely finished at the moment of naming:
 * the next thing a studio does is say what it needs settling, and that lives on
 * its own page.
 */
export async function createDeliverableAction(input: {
  domainId: string;
  name: string;
  unit?: string | null;
  /**
   * What it needs settling, declared in the same act as naming it.
   *
   * Written after the row exists because a variable needs an owner, but taken
   * in the same submission — a studio saying "edited photographs, and they are
   * softcopy or hardcopy" is describing one thing, not doing two jobs.
   */
  questions?: { label: string; kind: string; unit: string | null; options: string[] }[];
}) {
  const { outputTypeId } = await createDeliverable({
    serviceDomainId: input.domainId,
    name: input.name,
  });
  // Set separately because createDeliverable finds-or-creates by name, and a
  // unit typed here should land on the row either way.
  if (input.unit?.trim()) {
    await updateDeliverableConfig(outputTypeId, { default_unit: input.unit.trim() });
  }

  /*
   * Each in turn, and a failure here does not lose the deliverable — it is
   * already made, and a question that would not save can be added on its page.
   * Reported rather than swallowed, so an operator is not left believing they
   * declared something they did not.
   */
  const refused: string[] = [];
  for (const q of (input.questions || [])) {
    try {
      await declareDeliverableVariable({
        deliverableId: outputTypeId,
        variable: { label: q.label, kind: q.kind, unit: q.unit, options: q.options },
      });
    } catch {
      refused.push(q.label);
    }
  }
  return { id: outputTypeId, refused };
}

/**
 * Make a delivery container.
 *
 * THIS PATH WAS BROKEN AND REPORTED THE WRONG REASON. Both choices went to
 * createDeliverable, which resolves a name inside a service domain — and a
 * container has none, so it was called with an empty domain id.
 * findOrCreateDeliverableNamed returns null for that, and the caller throws
 * "Give the deliverable a name." So picking Delivery Container failed, blaming
 * the name, which was the one thing that was right.
 */
export async function createDeliveryContainerAction(name: string) {
  return createDeliveryContainer(name);
}
