"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { InstanceState } from '@/lib/domains/kernel/types';

// Hardcoded for Phase 4 scaffold. In production, this comes from auth session.
const SCAFFOLD_ORG_ID = '11111111-1111-1111-1111-111111111111';

export async function transitionInstance(instanceId: string, eventSuffix: string) {
  const supabase = await createClient();
  const repo = new KernelRepository(supabase);
  
  // Actor ID is undefined until auth is wired; the repository accepts string | undefined
  const success = await repo.transitionInstance(SCAFFOLD_ORG_ID, instanceId, eventSuffix, undefined);
  
  if (success) {
    // Revalidate the pipeline and ledger pages so they reflect the new state instantly
    revalidatePath('/instances');
    revalidatePath('/finance');
    revalidatePath('/specimen'); // For tests
  }
  
  return { success };
}
