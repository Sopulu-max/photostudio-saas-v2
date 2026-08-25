'use server';

import {
  createDeliverable
} from '@/modules/deliverables/interface';

export async function createDeliverableAction(input: { type?: 'output' | 'container', name: string, domainId?: string }) {
  return createDeliverable({ name: input.name, serviceDomainId: input.domainId || '' });
}
