'use server';

import {
  createDeliverable, createDeliveryContainer, updateDeliverableConfig,
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
  return { id: outputTypeId };
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
