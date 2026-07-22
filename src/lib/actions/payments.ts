'use server';

import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import { revalidatePath } from 'next/cache';
import type { FinancialTransaction, TransactionStatus } from '../types/engine';

/**
 * Mocks the settlement of a payment transaction (e.g., successful Stripe charge).
 * In a production environment, this would be invoked by a Stripe Webhook handler.
 */
export async function processPayment(txId: string) {
  // 1. Fetch current transaction
  const { data: tx, error: fetchError } = await supabaseAdmin
    .from('financial_transactions')
    .select('*')
    .eq('id', txId)
    .single();

  if (fetchError || !tx) {
    throw new Error('Transaction not found');
  }

  if (tx.status === 'settled') {
    return tx as FinancialTransaction; // Already settled
  }

  if (tx.status === 'voided') {
    throw new Error('Cannot process a voided transaction');
  }

  // 2. Update to settled
  const now = new Date().toISOString();
  const { data: updatedTx, error: updateError } = await supabaseAdmin
    .from('financial_transactions')
    .update({
      status: 'settled',
      settled_at: now
    })
    .eq('id', txId)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to settle transaction:', updateError);
    throw new Error('Failed to settle transaction');
  }

  // 3. Log event
  await logEvent({
    organizationId: tx.organization_id,
    entityType: 'financial_transaction',
    entityId: tx.id,
    action: 'payment_settled',
    actorId: tx.person_id || undefined, // Client is the actor paying
    payload: { amount: tx.amount, currency: tx.currency, type: tx.type }
  });

  // 4. Revalidate portal and dashboard caches
  revalidatePath(`/portal`, 'layout');
  revalidatePath(`/finances`);

  return updatedTx as FinancialTransaction;
}
