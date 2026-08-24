'use server';

import { createDeliverable as createOutput, createDeliveryContainer as createContainer } from '@/modules/deliverables/interface';

export async function createDeliverable(serviceDomainId: string, name: string) {
  return createOutput({ serviceDomainId, name });
}

export async function createDeliveryContainer(name: string) {
  return createContainer(name);
}
