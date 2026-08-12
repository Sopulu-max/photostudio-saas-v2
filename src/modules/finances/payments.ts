'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { settleTransaction } from './domain';
import type { FinancialTransaction } from '@/lib/types/engine';

/**
 * A client paying through the portal.
 *
 * This used to settle the row itself and log its own event, so the same fact —
 * this money arrived — was recorded two different ways depending on whether an
 * operator confirmed it or a client paid it. Now it resolves who is paying and
 * hands the transition to settleTransaction, which is the only thing that
 * moves money to settled.
 *
 * The caller is unauthenticated, so the organization is read from the
 * transaction itself rather than taken from the request. The transaction id is
 * the capability here, exactly as the share token is for a gallery.
 */
export async function processPayment(txId: string) {
  const { data: tx, error } = await supabaseAdmin
    .from('financial_transactions')
    .select('id, organization_id, contact_id, status')
    .eq('id', txId)
    .maybeSingle();

  if (error || !tx) throw new Error('Transaction not found');
  if (tx.status === 'voided') throw new Error('That invoice was withdrawn.');

  const settled = await settleTransaction({
    transactionId: tx.id,
    organizationId: tx.organization_id,
    // The client is the actor: they are the one who paid.
    paidBy: tx.contact_id,
  });

  revalidatePath('/portal', 'layout');
  revalidatePath('/finances');

  return settled as FinancialTransaction;
}
