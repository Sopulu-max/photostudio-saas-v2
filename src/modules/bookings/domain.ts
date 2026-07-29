'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { getService, getProductionPlanForService } from '@/modules/services/interface';
import { draftContractForBooking } from '@/modules/contracts/interface';
import { raiseInvoiceForBooking } from '@/modules/finances/interface';
import { startWorkForBookingLine } from '@/modules/production/interface';
import { revalidatePath } from 'next/cache';

/**
 * Create a booking. A title alone is enough — everything else (client, lines,
 * contract, money, work) associates later, in any order. This is the hub that
 * independent things cohere around, not a wizard step.
 */
export async function createBooking(input: {
  contactId?: string | null;
  serviceId?: string | null;
  scheduledFor?: string | null;
  title?: string;
}) {
  const { orgId, personId } = await getAuthOrgId();

  // Land on the studio's default stage (its own lifecycle, not a hardcoded one).
  const { data: defaultStage } = await supabaseAdmin
    .from('booking_stages')
    .select('id')
    .eq('organization_id', orgId)
    .order('is_default', { ascending: false })
    .order('position')
    .limit(1)
    .maybeSingle();
  if (!defaultStage) throw new Error('No booking stages configured for this studio.');

  // The name is composed from what's known — the studio never invents one.
  const custom = (input.title || '').trim();
  let clientName: string | null = null;
  if (input.contactId) {
    const { data: c } = await supabaseAdmin
      .from('contacts').select('display_name').eq('id', input.contactId).eq('organization_id', orgId).maybeSingle();
    clientName = c?.display_name ?? null;
  }
  let serviceName: string | null = null;
  if (input.serviceId) {
    const svc = await getService(input.serviceId);
    serviceName = svc?.name ?? null;
  }
  const title = custom || composeTitle({
    clientName,
    serviceTitles: serviceName ? [serviceName] : [],
    scheduledFor: input.scheduledFor ?? null,
  });

  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .insert({
      organization_id: orgId,
      title,
      title_custom: !!custom,
      stage_id: defaultStage.id,
      contact_id: input.contactId ?? null,
      scheduled_for: input.scheduledFor ?? null,
    })
    .select()
    .single();

  if (error || !booking) {
    console.error('Failed to create booking:', error);
    throw new Error('Failed to create booking');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking',
    entityId: booking.id,
    action: 'created',
    actorId: personId ?? undefined,
    payload: { title },
  });

  // A chosen service becomes the booking's first line straight away.
  if (input.serviceId) {
    await addBookingLine({ bookingId: booking.id, serviceId: input.serviceId, title: '' });
  }

  revalidatePath('/bookings');
  revalidatePath('/calendar');
  return { bookingId: booking.id };
}

/**
 * Attach (or change) the client on a booking, by contact id — the kernel-level
 * reference (à la sale.order.partner_id → res.partner). While Contracts and
 * kernel-level reference (à la sale.order.partner_id → res.partner).
 * contact's backfill link so those flows keep working mid-migration.
 */
export async function setBookingClient(input: { bookingId: string; contactId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, display_name, metadata')
    .eq('id', input.contactId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!contact) throw new Error('Contact not found');


  const { error } = await supabaseAdmin
    .from('bookings')
    .update({ contact_id: contact.id })
    .eq('id', input.bookingId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to set booking client:', error);
    throw new Error('Failed to set the client');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking',
    entityId: input.bookingId,
    action: 'client_set',
    actorId: actorId ?? undefined,
    payload: { contactId: contact.id, name: contact.display_name },
  });

  await refreshBookingTitle(input.bookingId);
  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/**
 * Add a service line to a booking. Optionally seeded from a service template
 * (which carries its price snapshot); or a free-form custom line.
 */
export async function addBookingLine(input: {
  bookingId: string;
  serviceId?: string | null;
  title: string;
  price?: Record<string, unknown>;
}) {
  const { orgId, personId } = await getAuthOrgId();

  // If seeded from a service, snapshot its pricing/title now — asked of the
  // Services module, not read from its tables.
  let title = (input.title || '').trim();
  let price = input.price ?? {};
  if (input.serviceId) {
    const svc = await getService(input.serviceId);
    if (svc) {
      if (!title) title = svc.name;
      if (!input.price) price = (svc.pricing as Record<string, unknown>) || {};
    }
  }
  if (!title) throw new Error('A line needs a name.');

  const { data: line, error } = await supabaseAdmin
    .from('booking_lines')
    .insert({
      organization_id: orgId,
      booking_id: input.bookingId,
      service_id: input.serviceId ?? null,
      title,
      price,
    })
    .select()
    .single();

  if (error || !line) {
    console.error('Failed to add booking line:', error);
    throw new Error('Failed to add line');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking_line',
    entityId: line.id,
    action: 'created',
    actorId: personId ?? undefined,
    payload: { bookingId: input.bookingId, title },
  });

  await refreshBookingTitle(input.bookingId);
  revalidatePath(`/bookings/${input.bookingId}`);
  return { lineId: line.id };
}

/**
 * Manually create a proposed contract for a booking — no intent required (the
 * kernel is unlocked). Terms are summed from the booking's lines. A contract
 * needs a party, so the booking must have a client.
 */
export async function createContractForBooking(bookingId: string) {
  const { orgId, personId } = await getAuthOrgId();

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, contact_id')
    .eq('id', bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking) throw new Error('Booking not found');
  if (!booking.contact_id) throw new Error('Add a client to this booking before creating a contract.');

  const { data: lines } = await supabaseAdmin
    .from('booking_lines')
    .select('price')
    .eq('booking_id', bookingId)
    .eq('organization_id', orgId);

  let total = 0;
  let currency = 'USD';
  for (const l of lines || []) {
    const p: any = l.price || {};
    total += Number(p.base_price || 0);
    if (p.currency) currency = p.currency;
  }
  const terms = { base_price: total, deposit_percentage: 0, currency };

  // Ask the Contracts module to draft it — Bookings never writes that table.
  const { contractId } = await draftContractForBooking({
    organizationId: orgId,
    bookingId,
    contactId: booking.contact_id,
    terms,
    actorId: personId,
  });

  revalidatePath(`/bookings/${bookingId}`);
  return { contractId };
}

/**
 * Raise an invoice on a booking — no contract required (unlocked). Amount and
 * label are whatever the studio wants (deposit, balance, a one-off).
 */
export async function addInvoiceToBooking(input: { bookingId: string; label: string; amount: number; currency?: string }) {
  const { orgId, personId } = await getAuthOrgId();

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, contact_id')
    .eq('id', input.bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking) throw new Error('Booking not found');

  // Ask Finances to raise it — Bookings never writes the money table.
  const { transactionId: txId } = await raiseInvoiceForBooking({
    organizationId: orgId,
    bookingId: input.bookingId,
    contactId: booking.contact_id ?? null,
    label: input.label,
    amount: input.amount,
    currency: input.currency,
    actorId: personId,
  });
  const tx = { id: txId };
  revalidatePath(`/bookings/${input.bookingId}`);
  return { transactionId: tx.id };
}

/**
 * Start work on a line, when the studio chooses — no contract required (the
 * kernel is unlocked). The line IS the production unit: its tasks come from the
 * service's blueprint, asked of Services and handed to Production.
 */
export async function startWorkForLine(input: { bookingId: string; lineId: string }) {
  const { orgId } = await getAuthOrgId();

  const { data: line } = await supabaseAdmin
    .from('booking_lines')
    .select('id, service_id')
    .eq('id', input.lineId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!line) throw new Error('Line not found');

  // Ask the Services module for this line's production plan — never read its
  // services/blueprints tables from here (seam discipline).
  const plan = line.service_id
    ? await getProductionPlanForService(line.service_id)
    : { blueprintId: null, stages: [] };

  // Production owns the work — Bookings asks, it doesn't write tasks itself.
  const { taskCount } = await startWorkForBookingLine({
    bookingId: input.bookingId,
    lineId: input.lineId,
    stages: plan.stages,
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { taskCount };
}

/** Set (or clear) when this booking happens. */
export async function setBookingSchedule(input: { bookingId: string; scheduledFor: string | null }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('bookings')
    .update({ scheduled_for: input.scheduledFor })
    .eq('id', input.bookingId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to set schedule:', error);
    throw new Error('Failed to set the date');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking',
    entityId: input.bookingId,
    action: input.scheduledFor ? 'scheduled' : 'unscheduled',
    actorId: actorId ?? undefined,
    payload: { scheduledFor: input.scheduledFor },
  });

  await refreshBookingTitle(input.bookingId);

  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/calendar');
  return { ok: true };
}

/**
 * Bookings scheduled within a window — the calendar's shoot layer. Carries just
 * enough context to be readable without opening the booking.
 */
export async function listBookingsInRange(fromISO: string, toISO: string) {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('id, title, scheduled_for, stage:booking_stages(name, kind), contact:contacts(display_name), booking_lines(title)')
    .eq('organization_id', orgId)
    .not('scheduled_for', 'is', null)
    .gte('scheduled_for', fromISO)
    .lte('scheduled_for', toISO)
    .order('scheduled_for');
  if (error) {
    console.error('Failed to list bookings in range:', error);
    throw new Error('Failed to load the calendar');
  }

  return (data || []).map((b: any) => ({
    kind: 'booking' as const,
    at: b.scheduled_for,
    bookingId: b.id,
    title: b.title,
    stage: b.stage?.name || null,
    stageKind: b.stage?.kind || null,
    client: b.contact?.display_name || null,
    services: (b.booking_lines || []).map((l: any) => l.title),
  }));
}

// ── Stages: the studio's own lifecycle ──────────────────────────────────────

export type StageKind = 'enquiry' | 'booked' | 'completed' | 'cancelled';

/** The studio's stages, in order. Consumers switch on `kind`, never on `name`. */
export async function listStages() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('booking_stages')
    .select('id, name, kind, position, is_default')
    .eq('organization_id', orgId)
    .order('position');
  if (error) {
    console.error('Failed to list stages:', error);
    throw new Error('Failed to load stages');
  }
  return data || [];
}

/** Move a booking to a stage. No cascade — see reviewCascadeForStage. */
export async function setBookingStage(input: { bookingId: string; stageId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: stage } = await supabaseAdmin
    .from('booking_stages')
    .select('id, name, kind')
    .eq('id', input.stageId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!stage) throw new Error('Stage not found');

  const { error } = await supabaseAdmin
    .from('bookings')
    .update({ stage_id: stage.id })
    .eq('id', input.bookingId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to set stage:', error);
    throw new Error('Failed to move the booking');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking',
    entityId: input.bookingId,
    action: 'stage_changed',
    actorId: actorId ?? undefined,
    payload: { stage: stage.name, kind: stage.kind },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/bookings');
  revalidatePath('/calendar');
  return { ok: true, kind: stage.kind as StageKind };
}

/**
 * What else is affected if this booking is cancelled — surfaced, never acted on.
 * The studio decides what to do about a live contract or an unpaid invoice;
 * cancelling a job does not cancel a debt.
 */
export async function reviewCascadeForCancel(bookingId: string) {
  const { orgId } = await getAuthOrgId();

  const [{ data: contracts }, { data: txns }, { data: lines }, { data: deliveries }] = await Promise.all([
    supabaseAdmin.from('contracts').select('id, status').eq('organization_id', orgId).eq('booking_id', bookingId),
    supabaseAdmin.from('financial_transactions').select('id, amount, currency, status').eq('organization_id', orgId).eq('booking_id', bookingId),
    supabaseAdmin.from('booking_lines').select('id').eq('organization_id', orgId).eq('booking_id', bookingId),
    supabaseAdmin.from('deliveries').select('id, status').eq('organization_id', orgId).eq('booking_id', bookingId),
  ]);

  const lineIds = (lines || []).map((l: any) => l.id);
  let openTasks = 0;
  if (lineIds.length) {
    const { count } = await supabaseAdmin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .in('booking_line_id', lineIds)
      .neq('status', 'completed');
    openTasks = count || 0;
  }

  const unpaid = (txns || []).filter((t: any) => t.status !== 'settled');
  return {
    activeContracts: (contracts || []).filter((c: any) => c.status === 'active').length,
    unpaidCount: unpaid.length,
    unpaidTotal: unpaid.reduce((s: number, t: any) => s + Number(t.amount || 0), 0),
    openTasks,
    sharedDeliveries: (deliveries || []).filter((d: any) => d.status === 'shared').length,
  };
}

// ── Stage configuration (Bookings owns its own settings) ────────────────────

export async function createStage(input: { name: string; kind: StageKind }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const name = (input.name || '').trim();
  if (!name) throw new Error('Give the stage a name.');

  const { data: last } = await supabaseAdmin
    .from('booking_stages')
    .select('position')
    .eq('organization_id', orgId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: stage, error } = await supabaseAdmin
    .from('booking_stages')
    .insert({ organization_id: orgId, name, kind: input.kind, position: (last?.position ?? -1) + 1 })
    .select('id')
    .single();
  if (error || !stage) {
    console.error('Failed to create stage:', error);
    throw new Error('Failed to add the stage (does that name already exist?)');
  }

  await logEvent({ organizationId: orgId, entityType: 'booking_stage', entityId: stage.id, action: 'created', actorId: actorId ?? undefined, payload: { name, kind: input.kind } });
  revalidatePath('/bookings/settings');
  return { stageId: stage.id };
}

export async function renameStage(input: { stageId: string; name: string }) {
  const { orgId } = await getAuthOrgId();
  const name = (input.name || '').trim();
  if (!name) throw new Error('Give the stage a name.');

  const { error } = await supabaseAdmin
    .from('booking_stages')
    .update({ name })
    .eq('id', input.stageId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to rename (does that name already exist?)');

  revalidatePath('/bookings/settings');
  revalidatePath('/bookings');
  return { ok: true };
}

/** Remove a stage. Bookings sitting on it move to the default stage. */
export async function deleteStage(stageId: string) {
  const { orgId } = await getAuthOrgId();

  const { data: stages } = await supabaseAdmin
    .from('booking_stages')
    .select('id, is_default')
    .eq('organization_id', orgId);
  if ((stages || []).length <= 1) throw new Error('Keep at least one stage.');

  const fallback = (stages || []).find((s: any) => s.is_default && s.id !== stageId) || (stages || []).find((s: any) => s.id !== stageId);
  if (!fallback) throw new Error('No stage left to move bookings to.');

  await supabaseAdmin.from('bookings').update({ stage_id: fallback.id }).eq('organization_id', orgId).eq('stage_id', stageId);
  const { error } = await supabaseAdmin.from('booking_stages').delete().eq('id', stageId).eq('organization_id', orgId);
  if (error) throw new Error('Failed to remove the stage');

  revalidatePath('/bookings/settings');
  revalidatePath('/bookings');
  return { ok: true };
}

// ── Editing what exists ─────────────────────────────────────────────────────

export async function renameBooking(input: { bookingId: string; title: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const title = (input.title || '').trim();
  if (!title) throw new Error('A booking needs a title.');

  // Renaming claims the name: auto-naming stops touching it from here.
  const { error } = await supabaseAdmin
    .from('bookings')
    .update({ title, title_custom: true })
    .eq('id', input.bookingId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to rename the booking');

  await logEvent({ organizationId: orgId, entityType: 'booking', entityId: input.bookingId, action: 'renamed', actorId: actorId ?? undefined, payload: { title } });
  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/bookings');
  return { ok: true };
}

/**
 * Delete a booking outright. Everything hanging off it goes too, so the caller
 * must have seen reviewCascadeForCancel first — cancelling is usually the right
 * move; deleting is for mistakes.
 */
export async function deleteBooking(bookingId: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: lines } = await supabaseAdmin
    .from('booking_lines').select('id').eq('organization_id', orgId).eq('booking_id', bookingId);
  const lineIds = (lines || []).map((l: any) => l.id);
  if (lineIds.length) {
    await supabaseAdmin.from('tasks').delete().eq('organization_id', orgId).in('booking_line_id', lineIds);
  }
  await supabaseAdmin.from('financial_transactions').delete().eq('organization_id', orgId).eq('booking_id', bookingId);
  await supabaseAdmin.from('contracts').delete().eq('organization_id', orgId).eq('booking_id', bookingId);
  await supabaseAdmin.from('deliveries').delete().eq('organization_id', orgId).eq('booking_id', bookingId);
  await supabaseAdmin.from('assignments').delete().eq('organization_id', orgId).eq('booking_id', bookingId);
  await supabaseAdmin.from('booking_lines').delete().eq('organization_id', orgId).eq('booking_id', bookingId);

  const { error } = await supabaseAdmin.from('bookings').delete().eq('id', bookingId).eq('organization_id', orgId);
  if (error) {
    console.error('Failed to delete booking:', error);
    throw new Error('Failed to delete the booking');
  }

  await logEvent({ organizationId: orgId, entityType: 'booking', entityId: bookingId, action: 'deleted', actorId: actorId ?? undefined });
  revalidatePath('/bookings');
  return { ok: true };
}

export async function updateBookingLine(input: {
  lineId: string;
  bookingId: string;
  title?: string;
  basePrice?: number | null;
  currency?: string;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: line } = await supabaseAdmin
    .from('booking_lines')
    .select('id, title, price')
    .eq('id', input.lineId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!line) throw new Error('Line not found');

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error('A line needs a name.');
    patch.title = t;
  }
  if (input.basePrice !== undefined || input.currency !== undefined) {
    const price: any = { ...(line.price as any) };
    if (input.basePrice !== undefined) price.base_price = input.basePrice;
    if (input.currency !== undefined) price.currency = input.currency;
    patch.price = price;
  }

  const { error } = await supabaseAdmin
    .from('booking_lines')
    .update(patch)
    .eq('id', input.lineId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to update the line');

  await logEvent({ organizationId: orgId, entityType: 'booking_line', entityId: input.lineId, action: 'updated', actorId: actorId ?? undefined, payload: patch });
  await refreshBookingTitle(input.bookingId);
  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/** Remove a line, and the work that was started on it. */
export async function removeBookingLine(input: { lineId: string; bookingId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  await supabaseAdmin.from('tasks').delete().eq('organization_id', orgId).eq('booking_line_id', input.lineId);
  const { error } = await supabaseAdmin
    .from('booking_lines')
    .delete()
    .eq('id', input.lineId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to remove the line');

  await logEvent({ organizationId: orgId, entityType: 'booking_line', entityId: input.lineId, action: 'removed', actorId: actorId ?? undefined, payload: { bookingId: input.bookingId } });
  await refreshBookingTitle(input.bookingId);
  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

// ── Naming: the module owns it, the studio never has to invent one ──────────

function formatDay(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Compose a booking's name from what's actually known about it:
 *   client + service  →  "Amara Obi — Studio Headshots"
 *   client            →  "Amara Obi"
 *   service + date    →  "Studio Headshots — 14 Jul"
 *   nothing yet       →  "New booking"
 * Extra services are counted rather than listed, so the name stays readable.
 */
function composeTitle(input: {
  clientName?: string | null;
  serviceTitles?: string[];
  scheduledFor?: string | null;
}) {
  const client = (input.clientName || '').trim();
  const services = (input.serviceTitles || []).filter(Boolean);
  const day = formatDay(input.scheduledFor ?? null);

  let what = services[0] || '';
  if (services.length > 1) what += ` +${services.length - 1}`;

  if (client && what) return `${client} — ${what}`;
  if (client) return day ? `${client} — ${day}` : client;
  if (what) return day ? `${what} — ${day}` : what;
  return day ? `Booking — ${day}` : 'New booking';
}

/**
 * Recompute a booking's name after its facts change. Silently does nothing if
 * the studio has claimed the name itself.
 */
export async function refreshBookingTitle(bookingId: string) {
  const { orgId } = await getAuthOrgId();

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, title, title_custom, scheduled_for, contact:contacts(display_name), booking_lines(title, created_at)')
    .eq('id', bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking || booking.title_custom) return { ok: true, title: booking?.title ?? null };

  const lines = ((booking as any).booking_lines || [])
    .slice()
    .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));

  const title = composeTitle({
    clientName: (booking as any).contact?.display_name,
    serviceTitles: lines.map((l: any) => l.title),
    scheduledFor: booking.scheduled_for,
  });

  if (title !== booking.title) {
    await supabaseAdmin
      .from('bookings')
      .update({ title })
      .eq('id', bookingId)
      .eq('organization_id', orgId);
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/bookings');
  }
  return { ok: true, title };
}
