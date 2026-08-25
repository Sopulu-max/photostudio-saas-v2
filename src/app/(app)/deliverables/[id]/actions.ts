'use server';

import {
  renameDeliverable,
  deleteDeliverable,
  updateDeliverableConfig as updateDeliverableConfigCore
} from '@/modules/deliverables/interface';

export async function updateDeliverableConfig(id: string, input: any) {
  return updateDeliverableConfigCore(id, input);
}

export async function updateDeliverable(id: string, type: 'output' | 'container', name: string) {
  return renameDeliverable(id, name);
}

export async function deleteOutputOrContainer(id: string, type: 'output' | 'container') {
  return deleteDeliverable(id);
}
