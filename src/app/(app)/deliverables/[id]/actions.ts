'use server';

import {
  renameDeliverable,
  renameDeliveryContainer,
  deleteDeliverable,
  deleteDeliveryContainer,
  updateDeliverableConfig as updateDeliverableConfigCore
} from '@/modules/deliverables/interface';

export async function updateDeliverableConfig(id: string, input: any) {
  return updateDeliverableConfigCore(id, input);
}

export async function updateDeliverable(id: string, type: 'output' | 'container', name: string) {
  if (type === 'output') {
    return renameDeliverable(id, name);
  } else {
    return renameDeliveryContainer(id, name);
  }
}

export async function deleteDeliverableEntity(id: string, type: 'output' | 'container') {
  if (type === 'output') {
    return deleteDeliverable(id);
  } else {
    return deleteDeliveryContainer(id);
  }
}
