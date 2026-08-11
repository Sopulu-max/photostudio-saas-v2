/**
 * Which events interrupt someone, how they read, and where they lead.
 *
 * Split out of notifications.ts because that file is `'use server'` and may
 * only export async functions — the same reason services keeps variableTypes
 * separate from its domain. Keeping the registry here means the browser and
 * the server agree on what counts as a notification instead of each holding
 * its own idea: the panel is rendered from it, and the live subscription
 * filters on it, so a sound can never fire for something the panel won't show.
 */

export type Notifiable = {
  /** Reads as "<who> <phrase>" — the same voice as the activity feed. */
  phrase: string;
  /** Where clicking it should land. Payload carries what the entity id can't. */
  href: (e: { entityId: string; payload: Record<string, any> }) => string;
};

export type Notification = {
  id: string;
  at: string;
  description: string;
  href: string;
  unread: boolean;
};

/**
 * Deliberately excluded: everything in the catalog (services, packages,
 * blueprints, roles) and every rename. Defining what the studio does is
 * considered work, not news — it belongs in the activity feed. What arrives
 * here is the outside world acting, or a colleague changing something already
 * in motion.
 */
export const NOTIFIABLE: Record<string, Notifiable> = {
  // The outside world. Actor is a client contact, so these always pass the
  // "not you" rule.
  'booking.created':                       { phrase: 'booked', href: (e) => `/bookings/${e.entityId}` },
  'contract.activated':                    { phrase: 'signed a contract', href: (e) => `/contracts/${e.entityId}` },
  'financial_transaction.payment_settled': { phrase: 'paid an invoice', href: () => `/finances` },
  'delivery.viewed':                       { phrase: 'opened the gallery', href: (e) => e.payload?.bookingId ? `/bookings/${e.payload.bookingId}` : `/bookings` },

  // In motion — a colleague moved something that is already live.
  'booking.stage_changed':  { phrase: 'moved a booking along',        href: (e) => `/bookings/${e.entityId}` },
  'booking.scheduled':      { phrase: 'put a date on a booking',      href: (e) => `/bookings/${e.entityId}` },
  'booking.deleted':        { phrase: 'deleted a booking',            href: () => `/bookings` },
  'booking.crew_assigned':  { phrase: 'put someone on a booking',     href: (e) => `/bookings/${e.entityId}` },
  'booking_line.created':   { phrase: 'added a package to a booking', href: (e) => e.payload?.bookingId ? `/bookings/${e.payload.bookingId}` : `/bookings` },
  'task.assigned':          { phrase: 'assigned a task',              href: () => `/tasks` },
  'financial_transaction.created': { phrase: 'raised an invoice',     href: () => `/finances` },
  'contract.cancelled':     { phrase: 'cancelled a contract',         href: (e) => `/contracts/${e.entityId}` },
  'delivery.shared':        { phrase: 'shared a delivery',            href: (e) => e.payload?.bookingId ? `/bookings/${e.payload.bookingId}` : `/bookings` },
};

/**
 * The actions worth querying for. Looser than the registry on purpose:
 * PostgREST cannot express "this entity type with this action", so the query
 * narrows by action and isNotifiable() decides the pair.
 */
export const NOTIFIABLE_ACTIONS = [...new Set(Object.keys(NOTIFIABLE).map((k) => k.split('.')[1]))];

export function notifiableFor(entityType: string, action: string): Notifiable | undefined {
  return NOTIFIABLE[`${entityType}.${action}`];
}

export function isNotifiable(entityType: string, action: string): boolean {
  return Boolean(notifiableFor(entityType, action));
}
