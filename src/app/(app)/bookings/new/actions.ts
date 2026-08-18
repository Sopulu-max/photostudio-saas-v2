'use server';

import { getOpenVariablesForPackage } from '@/modules/packages/interface';

export async function getOpenVariablesForBookingIntake(packageId: string) {
  return getOpenVariablesForPackage(packageId);
}
