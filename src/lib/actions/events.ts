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
 * This is not a soft operation. Organizational memory MUST be maintained.
 * Throws on failure so callers are aware the audit trail is broken.
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
    // Organizational memory is non-negotiable. We throw so callers
    // know the event log is compromised and can surface the error.
    console.error('[EventLog] CRITICAL: Failed to persist event to organizational memory:', error);
    throw new Error(`[EventLog] Failed to log event '${params.action}' for entity '${params.entityType}:${params.entityId}'`);
  }
}
