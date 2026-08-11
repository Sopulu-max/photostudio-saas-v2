'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

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

/**
 * How each `entityType.action` this system actually emits reads in English.
 *
 * Kept next to logEvent on purpose: the phrasing is a property of the event
 * vocabulary, not of whichever page happens to render a feed. Every key below
 * corresponds to a real logEvent call somewhere in src/modules or src/kernel —
 * when a module starts emitting something new, its phrase belongs here, and
 * anything missing degrades to a readable fallback rather than a blank.
 */
const ACTIVITY_PHRASING: Record<string, string> = {
  // Bookings — the hub
  'booking.created':        'created a booking',
  'booking.client_set':     'attached a client to a booking',
  'booking.stage_changed':  'moved a booking to a new stage',
  'booking.scheduled':      'put a date on a booking',
  'booking.unscheduled':    'took the date off a booking',
  'booking.renamed':        'renamed a booking',
  'booking.deleted':        'deleted a booking',
  'booking.crew_assigned':  'put someone on a booking',
  'booking.crew_removed':   'took someone off a booking',
  'booking_line.created':   'added a package to a booking',
  'booking_line.updated':   'changed what a booking includes',
  'booking_line.removed':   'removed a package from a booking',
  'booking_stage.created':  'added a booking stage',

  // Services — the ontology layer
  'service.created':    'defined a new service',
  'service.updated':    'updated a service',
  'service.duplicated': 'duplicated a service',
  'service.retired':    'retired a service',
  'service.restored':   'brought a service back',
  'service.variables_updated': 'changed what varies on a service',
  'blueprint.created':  'created a blueprint',
  'blueprint.updated':  'changed a blueprint',
  'blueprint.deleted':  'removed a blueprint',

  // Packages — the commercial layer
  'package.created':           'created a package',
  'package.updated':           'updated a package',
  'package.duplicated':        'duplicated a package',
  'package.retired':           'retired a package',
  'package.restored':          'put a package back on sale',
  'package.questions_updated': 'changed a package’s intake questions',

  // Production
  'task.created':        'started work on a booking',
  'task.status_updated': 'moved a task along',
  'task.assigned':       'assigned a task',
  'task.asset_produced': 'produced a file from a task',

  // Money
  'financial_transaction.created':        'raised an invoice',
  'financial_transaction.status_updated': 'updated an invoice',
  'financial_transaction.payment_settled': 'settled a payment',

  // Contracts
  'contract.created':       'drafted a contract',
  'contract.activated':     'activated a contract',
  'contract.terms_revised': 'revised a contract’s terms',
  'contract.cancelled':     'cancelled a contract',

  // Delivery
  'delivery.created':        'created a delivery',
  'delivery.file_added':     'added files to a delivery',
  'delivery.shared':         'shared a delivery',
  'delivery.unshared':       'stopped sharing a delivery',
  'delivery.deleted':        'deleted a delivery',
  'delivery.fulfilment_set': 'marked what a delivery covers',
  'delivery.viewed':         'opened the gallery',

  // People
  'client.created':         'added a client',
  'client.updated':         'updated a client',
  'client.archived':        'archived a client',
  'client.restored':        'restored a client',
  'employee.created':       'added a team member',
  'employee.updated':       'updated a team member',
  'employee.role_assigned': 'gave a team member a role',
  'employee.role_removed':  'took a role off a team member',
  'employee.archived':      'archived a team member',
  'employee.restored':      'restored a team member',
  'role.created':           'created a role',

  // Studio
  'organization.created':        'set up the studio',
  'organization.status_updated': 'changed the studio’s status',
};

/**
 * The studio's recent activity, already phrased. The overview reads this rather
 * than the events table, so the vocabulary lives in one place instead of being
 * re-guessed by whichever surface shows a feed.
 */
export async function listRecentActivity(limit = 8) {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('events')
    .select('id, entity_type, action, created_at, actor:contacts(display_name)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to load activity:', error);
    return [];
  }

  return ((data || []) as any[]).map((e) => {
    const who = e.actor?.display_name || 'Someone';
    const phrase =
      ACTIVITY_PHRASING[`${e.entity_type}.${e.action}`] ??
      `${String(e.action).replace(/_/g, ' ')} a ${String(e.entity_type).replace(/_/g, ' ')}`;
    return { id: e.id as string, at: e.created_at as string, description: `${who} ${phrase}` };
  });
}
