'use server';

import { redirect } from 'next/navigation';
import { getOrCreateStorefrontLayout, getOrCreateServiceLayout } from '@/lib/actions/layouts';

export async function openStorefrontDesigner() {
  const layoutId = await getOrCreateStorefrontLayout();
  redirect(`/visual-layouts/${layoutId}`);
}

export async function openServiceDesigner(serviceId: string) {
  const layoutId = await getOrCreateServiceLayout(serviceId);
  redirect(`/visual-layouts/${layoutId}`);
}
