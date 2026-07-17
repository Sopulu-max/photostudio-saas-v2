'use server';

import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { FinancialTransaction, TransactionDirection, TransactionStatus } from '../types/engine';

export async function createTransaction(params: {
  organizationId: string;
  agreementId?: string;
  personId?: string;
  direction: TransactionDirection;
  type: string; // e.g., 'invoice', 'deposit', 'refund'
  amount: number;
  currency?: string;
  dueDate?: string;
  actorId: string;
}) {
  const { data: transaction, error } = await supabaseAdmin
    .from('financial_transactions')
    .insert({
      organization_id: params.organizationId,
      agreement_id: params.agreementId || null,
      person_id: params.personId || null,
      direction: params.direction,
      type: params.type,
      amount: params.amount,
      currency: params.currency || 'USD',
      due_date: params.dueDate || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create transaction:', error);
    throw new Error('Failed to create transaction');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'financial_transaction',
    entityId: transaction.id,
    action: 'created',
    actorId: params.actorId,
    payload: { type: params.type, amount: params.amount, direction: params.direction }
  });

  return transaction as FinancialTransaction;
}

export async function settleTransaction(
  transactionId: string,
  organizationId: string,
  actorId: string // The webhook process or the person who manually marked it paid
) {
  const { data: transaction, error } = await supabaseAdmin
    .from('financial_transactions')
    .update({ 
      status: 'settled',
      settled_at: new Date().toISOString()
    })
    .eq('id', transactionId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) {
    console.error('Failed to settle transaction:', error);
    throw new Error('Failed to settle transaction');
  }

  await logEvent({
    organizationId,
    entityType: 'financial_transaction',
    entityId: transaction.id,
    action: 'status_updated',
    actorId,
    payload: { status: 'settled', settled_at: transaction.settled_at }
  });

  return transaction as FinancialTransaction;
}
