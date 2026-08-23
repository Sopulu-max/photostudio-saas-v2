'use server';

import { getOpenVariablesForPackage, createPackage } from '@/modules/packages/interface';

export async function getOpenVariablesForBookingIntake(packageId: string) {
  return getOpenVariablesForPackage(packageId);
}

export async function createInlinePackage(input: {
  name: string;
  serviceId: string;
  valueIds: string[];
}) {
  return createPackage({
    name: input.name,
    serviceIds: [input.serviceId],
    narrowings: input.valueIds.map(vid => ({ serviceId: input.serviceId, valueId: vid }))
  });
}
