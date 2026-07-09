'use server';

import { createClient } from '@/lib/supabase/server';
import { getOrgId } from '@/lib/auth';
import { FinanceRepository } from '@/lib/domains/finance/repository';
import { revalidatePath } from 'next/cache';

export async function recordPaymentAction(invoiceId: string, amount: number, method: string) {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Unauthorized');
  
  const supabase = await createClient();
  const repo = new FinanceRepository(supabase);
  
  const payment = await repo.recordPayment(orgId, invoiceId, amount, method);
  revalidatePath('/finance');
  revalidatePath('/');
  return payment;
}
