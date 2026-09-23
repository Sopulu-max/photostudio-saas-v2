import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { readBookingsSheet, type BookingsSheet, type SheetBooking, type Period } from './sheet';

/**
 * THE REGISTER - every booking a row, every fact from the inventory a column.
 *
 * The page is one set of rows read three ways (table, board, calendar), so
 * there is one read for all three: whatever a column needs arrives here, and
 * the views only present it. What the sheet already decides - the band, the
 * work, what a booking needs, its answers, its planes, the axes it takes - is
 * reused rather than re-derived (readBookingsSheet).
 *
 * Three facts the sheet does not carry, each read in ONE query for the whole
 * book rather than per row, because a register draws every booking at once:
 *
 *   committed     what a booking's packages promise - the deliverable, its
 *                 quantity, and the extras added on this booking. A quantity
 *                 may be null: the package left the number to somebody, which
 *                 is not the same as none.
 *   personnel     the declared crew (assignments), in the studio's own role
 *                 names - a different fact from who is on a step.
 *   lastActivity  when anything last happened to the booking, from the events
 *                 log, which is the only record of transitions.
 *
 * Money is not here, by ruling: value and settlement are Finances' to report.
 */

export type Committed = {
  /** The studio's own word for what is made, with what this booking owes of it. */
  deliverable: string;
  quantity: number;
  /** Units added on this booking beyond what its packages promise. */
  extra: number;
  /** The package left the number to the client or a member: a promise with no figure. */
  undecided: boolean;
};

export type RegisterRow = SheetBooking & {
  committed: Committed[];
  /** Declared crew, as "Name (Role)" in the studio's role names. */
  personnel: string[];
  lastActivity: { at: string; action: string } | null;
};

export type BookingsRegister = {
  sheet: BookingsSheet;
  rows: RegisterRow[];
};

export async function readBookingsRegister(period: Period = 30, given?: BookingsSheet): Promise<BookingsRegister> {
  const { orgId } = await getAuthOrgId();
  const sheet = given ?? await readBookingsSheet(period);
  const rows = sheet.bands.flatMap((b) => b.rows);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { sheet, rows: [] };

  const lineIds = rows.flatMap((r) => r.lineIds);
  const [promised, extras, crew, events] = await Promise.all([
    /*
     * WHAT THE PACKAGES PROMISE, for the whole book at once.
     *
     * The promise hangs off the package instance, not the booking: line →
     * package → package_service → package_deliverables → deliverable. A
     * booking carrying the same package twice owes twice, so this is summed
     * per line and not per package.
     */
    supabaseAdmin
      .from('booking_lines')
      .select('id, booking_id, package_id, package:packages(package_services(package_deliverables(quantity, decided_by, deliverable:deliverables(id, name))))')
      .eq('organization_id', orgId)
      .in('booking_id', ids),
    // More of a promise, added on this booking: kind 'promise', ref_id = the deliverable.
    supabaseAdmin
      .from('booking_line_extras')
      .select('booking_line_id, kind, ref_id, units, label')
      .eq('organization_id', orgId)
      .in('booking_line_id', lineIds.length > 0 ? lineIds : ['00000000-0000-0000-0000-000000000000']),
    supabaseAdmin
      .from('assignments')
      .select('booking_id, role:roles(name), employee:employees(contact:contacts(display_name))')
      .eq('organization_id', orgId)
      .in('booking_id', ids),
    supabaseAdmin
      .from('events')
      .select('entity_id, action, created_at')
      .eq('organization_id', orgId)
      .eq('entity_type', 'booking')
      .in('entity_id', ids)
      .order('created_at', { ascending: false }),
  ]);

  if (promised.error) console.error('Failed to read what the book promises:', promised.error);
  if (extras.error) console.error('Failed to read the extras:', extras.error);
  if (crew.error) console.error('Failed to read the declared crew:', crew.error);
  if (events.error) console.error('Failed to read when bookings last moved:', events.error);

  // ---- committed, per booking, per deliverable
  type Tally = { name: string; quantity: number; extra: number; undecided: boolean };
  const byBooking = new Map<string, Map<string, Tally>>();
  const lineOwner = new Map<string, string>();
  for (const l of ((promised.data || []) as any[])) {
    lineOwner.set(l.id as string, l.booking_id as string);
    const tallies = byBooking.get(l.booking_id) ?? new Map<string, Tally>();
    byBooking.set(l.booking_id, tallies);
    for (const ps of (l.package?.package_services ?? [])) {
      for (const pd of (ps.package_deliverables ?? [])) {
        const d = pd.deliverable;
        if (!d?.id) continue;
        const had = tallies.get(d.id) ?? { name: d.name as string, quantity: 0, extra: 0, undecided: false };
        if (pd.quantity === null || pd.quantity === undefined) had.undecided = true;
        else had.quantity += Number(pd.quantity);
        tallies.set(d.id, had);
      }
    }
  }
  for (const e of ((extras.data || []) as any[])) {
    if (e.kind !== 'promise' || !e.ref_id) continue;
    const bookingId = lineOwner.get(e.booking_line_id as string);
    if (!bookingId) continue;
    const tallies = byBooking.get(bookingId);
    const had = tallies?.get(e.ref_id as string);
    // An extra of a deliverable the packages never promised still counts, named by its own label.
    if (had) had.extra += Number(e.units ?? 0);
    else tallies?.set(e.ref_id as string, { name: String(e.label ?? 'Added on this booking'), quantity: 0, extra: Number(e.units ?? 0), undecided: false });
  }

  // ---- the declared crew, in the studio's role names
  const personnelOf = new Map<string, string[]>();
  for (const a of ((crew.data || []) as any[])) {
    const who = a.employee?.contact?.display_name as string | undefined;
    if (!who) continue;
    const role = a.role?.name as string | undefined;
    const said = role ? `${who} (${role})` : who;
    const had = personnelOf.get(a.booking_id) ?? [];
    if (!had.includes(said)) had.push(said);
    personnelOf.set(a.booking_id, had);
  }

  // ---- when each booking last moved (the newest event, the query is already ordered)
  const lastOf = new Map<string, { at: string; action: string }>();
  for (const e of ((events.data || []) as any[])) {
    if (lastOf.has(e.entity_id)) continue;
    lastOf.set(e.entity_id, { at: e.created_at as string, action: String(e.action) });
  }

  return {
    sheet,
    rows: rows.map((r) => ({
      ...r,
      committed: [...(byBooking.get(r.id)?.values() ?? [])]
        .map((t) => ({ deliverable: t.name, quantity: t.quantity, extra: t.extra, undecided: t.undecided }))
        .sort((a, b) => b.quantity + b.extra - (a.quantity + a.extra) || a.deliverable.localeCompare(b.deliverable)),
      personnel: personnelOf.get(r.id) ?? [],
      lastActivity: lastOf.get(r.id) ?? null,
    })),
  };
}
