'use server';

import { supabaseAdmin } from '../supabase/admin';

export interface LogEventParams {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Logs an event to the organizational memory (events table).
 * Must be called from other server actions after any successful state mutation.
 */
export async function logEvent(params: LogEventParams) {
  const { error } = await supabaseAdmin
    .from('events')
    .insert({
      organization_id: params.organizationId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      actor_id: params.actorId || null,
      payload: params.payload || {},
    });

  if (error) {
    // We log the error but don't throw, so we don't break the main transaction.
    // In a production system we'd pipe this to a robust error tracking tool (Sentry etc).
    console.error('Failed to log event:', error);
  }
}
