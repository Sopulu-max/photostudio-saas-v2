'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { getPackageForBooking, getProductionPlanForPackage, getPaymentPoliciesForPackages, getPackageVariables } from '@/modules/packages/interface';
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
  packageId?: string | null;
  linePrice?: Record<string, unknown>;
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
  let packageName: string | null = null;
  if (input.packageId) {
    const pkg = await getPackageForBooking(input.packageId);
    packageName = pkg?.name ?? null;
  }
  const title = custom || composeTitle({
    clientName,
    lineTitles: packageName ? [packageName] : [],
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

  // A chosen package becomes the booking's first line straight away.
  if (input.packageId) {
    await addBookingLine({ bookingId: booking.id, packageId: input.packageId, title: '', price: input.linePrice });
  }

  revalidatePath('/bookings');
  revalidatePath('/calendar');
  return { bookingId: booking.id };
}

/**
 * A booking arriving from outside — the public booking page. It is the same
 * booking as any other; the only real difference is that nobody is logged in,
 * so the organization comes in explicitly instead of from a session (the
 * pattern draftContractForBooking and raiseInvoiceForBooking already use).
 *
 * This exists so the public path stops being a second implementation of
 * booking creation. It was inserting bookings and lines itself and naming them
 * its own way — meaning a booking made by a client and one made by an operator
 * followed different naming rules, and only the operator's could ever be
 * auto-renamed as facts arrived.
 */
export async function createBookingFromIntake(input: {
  organizationId: string;
  contactId: string;
  clientName: string;
  packageId?: string | null;
  packageName: string;
  linePrice?: Record<string, unknown>;
  answers?: Record<string, unknown>;
  /** What the client chose for whatever the package left open. */
  variableAnswers?: { serviceVariableId: string; value: unknown }[];
  source?: string;
  scheduledFor?: string | null;
}) {
  const orgId = input.organizationId;

  // Land on an enquiry-kind stage if the studio has one, but never require it —
  // a studio may not use that idea at all. Then their default, then the first.
  const { data: stages } = await supabaseAdmin
    .from('booking_stages')
    .select('id, kind, is_default, position')
    .eq('organization_id', orgId)
    .order('position');
  const landingStage =
    (stages || []).find((s: any) => s.kind === 'enquiry') ||
    (stages || []).find((s: any) => s.is_default) ||
    (stages || [])[0];
  if (!landingStage) throw new Error('This studio has no booking stages configured.');

  // The module's own naming, so an intake booking reads like every other one —
  // and title_custom stays false, so it keeps improving as facts arrive.
  const title = composeTitle({ clientName: input.clientName, lineTitles: [input.packageName] });

  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .insert({
      organization_id: orgId,
      contact_id: input.contactId,
      title,
      title_custom: false,
      stage_id: landingStage.id,
      scheduled_for: input.scheduledFor || null,
      metadata: { source: input.source || 'public_booking_page', form_responses: input.answers || {} },
    })
    .select('id')
    .single();
  if (error || !booking) {
    console.error('Failed to create booking from intake:', error);
    throw new Error('Failed to create your booking request.');
  }

  const { data: intakeLine, error: lineError } = await supabaseAdmin.from('booking_lines').insert({
    organization_id: orgId,
    booking_id: booking.id,
    package_id: input.packageId,
    title: input.packageName,
    price: input.linePrice || {},
  }).select('id').single();
  if (lineError || !intakeLine) {
    console.error('Failed to add intake booking line:', lineError);
    throw new Error('Failed to create your booking request.');
  }

  // The line is configured the moment it exists: the package's own scope, plus
  // whatever the client answered for what it left open. Without this an intake
  // booking would arrive knowing less than the package it came from.
  if (input.packageId) {
    await setLineConfiguration({
      bookingId: booking.id,
      lineId: intakeLine.id,
      answers: input.variableAnswers,
      source: 'client',
      organizationId: orgId,
    });
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking',
    entityId: booking.id,
    action: 'created',
    actorId: input.contactId,
    payload: { source: input.source || 'public_booking_page', packageId: input.packageId },
  });

  revalidatePath('/bookings');
  revalidatePath('/calendar');
  return { bookingId: booking.id };
}

/**
 * Record what a line is actually configured as.
 *
 * A line's configuration is the package's offer plus whatever the client chose
 * for what the package left open. Both are written here, tagged by where they
 * came from, so the studio can later tell "we sold them 2 outfits" apart from
 * "they asked for 6 hours".
 *
 * Package values are copied rather than referenced on purpose. They are a
 * snapshot, exactly like the line's price: repricing or re-scoping a package
 * next month must not silently rewrite what an existing client agreed to.
 */
export async function setLineConfiguration(input: {
  bookingId: string;
  lineId: string;
  /** Only what the client (or an operator on their behalf) chose. */
  answers?: { serviceVariableId: string; value: unknown }[];
  /**
   * Variables to drop entirely. An empty answer means "nothing said here",
   * which is not the same as "we agreed on nothing" — clearing has to be
   * asked for, or every edit would erase the values it didn't touch.
   */
  clear?: string[];
  /** Defaults to 'client'; pass 'studio' when an operator fills it in. */
  source?: 'client' | 'studio';
  organizationId?: string;
}) {
  const orgId = input.organizationId ?? (await getAuthOrgId()).orgId;

  const { data: line } = await supabaseAdmin
    .from('booking_lines')
    .select('id, package_id')
    .eq('id', input.lineId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!line) throw new Error('Line not found');

  // What this line already holds. Its presence is what tells us whether the
  // package's scope still needs inheriting.
  const { data: existingRows } = await supabaseAdmin
    .from('booking_line_variable_values')
    .select('service_variable_id, value, source')
    .eq('organization_id', orgId)
    .eq('booking_line_id', input.lineId);
  const existing = (existingRows || []) as any[];

  await supabaseAdmin
    .from('booking_line_variable_values')
    .delete()
    .eq('organization_id', orgId)
    .eq('booking_line_id', input.lineId);

  type Row = { organization_id: string; booking_line_id: string; service_variable_id: string; value: unknown; source: string };

  // What the line starts from before this call's answers are applied.
  const inherited: Row[] = [];

  if (existing.length > 0) {
    // Already configured, so this is an edit. Carry the existing values
    // forward untouched — re-reading the package here is exactly how a
    // re-scoped package would silently rewrite what a client already agreed
    // to, which is the thing the snapshot exists to prevent.
    for (const e of existing) {
      inherited.push({
        organization_id: orgId,
        booking_line_id: input.lineId,
        service_variable_id: e.service_variable_id,
        value: e.value,
        source: e.source,
      });
    }
  } else if (line.package_id) {
    // First configuration: inherit whatever the package fixed, snapshotted.
    const { data: fixed } = await supabaseAdmin
      .from('package_variable_values')
      .select('service_variable_id, value')
      .eq('organization_id', orgId)
      .eq('package_id', line.package_id);
    for (const f of ((fixed || []) as any[])) {
      inherited.push({
        organization_id: orgId,
        booking_line_id: input.lineId,
        service_variable_id: f.service_variable_id,
        value: f.value,
        source: 'package',
      });
    }
  }

  // Then the answers, which win over anything already held — an operator
  // overriding the offer for this one client is legitimate, and so is a
  // client revising what they asked for.
  const answers: Row[] = [];
  const answered = new Set<string>();
  for (const a of (input.answers || [])) {
    if (!a.serviceVariableId || a.value === undefined || a.value === null || a.value === '') continue;
    answered.add(a.serviceVariableId);
    answers.push({
      organization_id: orgId,
      booking_line_id: input.lineId,
      service_variable_id: a.serviceVariableId,
      value: a.value,
      source: input.source || 'client',
    });
  }
  const cleared = new Set(input.clear || []);
  const rows = [
    ...inherited.filter((r) => !answered.has(r.service_variable_id) && !cleared.has(r.service_variable_id)),
    ...answers.filter((r) => !cleared.has(r.service_variable_id)),
  ];

  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from('booking_line_variable_values').insert(rows);
    if (error) {
      console.error('Failed to save line configuration:', error);
      throw new Error('Failed to save what was chosen');
    }
  }

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true, count: rows.length };
}

/** What a line is configured as — the offer and the client's answers, in one list. */
export async function getLineConfiguration(lineId: string) {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('booking_line_variable_values')
    .select('value, source, variable:service_variables(id, key, label, unit, position)')
    .eq('organization_id', orgId)
    .eq('booking_line_id', lineId);
  if (error) {
    console.error('Failed to load line configuration:', error);
    return [];
  }
  return ((data || []) as any[])
    .filter((r) => r.variable)
    .map((r) => ({
      serviceVariableId: r.variable.id,
      key: r.variable.key,
      label: r.variable.label,
      unit: r.variable.unit ?? null,
      value: r.value,
      source: r.source as 'package' | 'client' | 'studio',
      position: r.variable.position ?? 0,
    }))
    .sort((a, b) => a.position - b.position);
}

/**
 * Everything a line could be configured as, with what it currently is — the
 * shape an operator edits against. Unlike getLineConfiguration (which reports
 * only what was recorded), this includes variables nobody has answered yet, so
 * a studio can fill in what a client skipped at booking.
 */
export async function getLineConfigurationForm(lineId: string) {
  const { orgId } = await getAuthOrgId();

  const { data: line } = await supabaseAdmin
    .from('booking_lines')
    .select('id, package_id')
    .eq('id', lineId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!line) return [];

  const held = await getLineConfiguration(lineId);
  const byId = new Map(held.map((h) => [h.serviceVariableId, h]));

  // A line without a package can still hold values (the package was removed
  // after the fact), so what's held is the floor, not the package's list.
  const declared = line.package_id ? await getPackageVariables(line.package_id) : [];
  const seen = new Set<string>();
  const fields = declared.map((v: any) => {
    seen.add(v.id);
    const current = byId.get(v.id);
    return {
      serviceVariableId: v.id,
      key: v.key,
      label: v.label,
      kind: v.kind as string,
      unit: v.unit as string | null,
      options: v.options as string[],
      min: v.min as number | null,
      max: v.max as number | null,
      serviceName: v.serviceName as string,
      value: current ? current.value : null,
      source: current ? current.source : null,
      position: v.position as number,
    };
  });

  // Anything held but no longer declared still shows, so it can be seen and
  // cleared rather than silently haunting the line.
  for (const h of held) {
    if (seen.has(h.serviceVariableId)) continue;
    fields.push({
      serviceVariableId: h.serviceVariableId,
      key: h.key,
      label: h.label,
      kind: 'text',
      unit: h.unit,
      options: [],
      min: null,
      max: null,
      serviceName: '',
      value: h.value,
      source: h.source,
      position: h.position,
    });
  }

  return fields.sort((a, b) => a.position - b.position);
}

/**
 * Attach (or change) the client on a booking, by contact id — the kernel-level
 * reference (à la sale.order.partner_id → res.partner). The booking points at a
 * contact, not at a Client record: someone can be on a booking before the studio
 * has decided they're a client at all.
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
 * Add a package line to a booking. Optionally seeded from a Package (which
 * carries its price snapshot); or a free-form custom line.
 */
export async function addBookingLine(input: {
  bookingId: string;
  packageId?: string | null;
  title: string;
  price?: Record<string, unknown>;
  quantity?: number;
}) {
  const { orgId, personId } = await getAuthOrgId();

  // If seeded from a package, snapshot its pricing/title now — asked of the
  // Packages module, not read from its tables.
  let title = (input.title || '').trim();
  let price = input.price ?? {};
  if (input.packageId) {
    const pkg = await getPackageForBooking(input.packageId);
    if (pkg) {
      if (!title) title = pkg.name;
      if (!input.price) {
        // Snapshot the unit alongside the price: what it was sold as, at the
        // time it was sold.
        price = { ...((pkg.pricing as Record<string, unknown>) || {}), unit: (pkg as any).price_unit ?? null };
      }
    }
  }
  if (!title) throw new Error('A line needs a name.');

  const { data: line, error } = await supabaseAdmin
    .from('booking_lines')
    .insert({
      organization_id: orgId,
      booking_id: input.bookingId,
      package_id: input.packageId ?? null,
      title,
      price,
      quantity: input.quantity ?? 1,
    })
    .select()
    .single();

  if (error || !line) {
    console.error('Failed to add booking line:', error);
    throw new Error('Failed to add line');
  }

  // A line added from a package inherits that package's scope immediately, so
  // the booking says what was sold without waiting for anyone to confirm it.
  if (input.packageId) {
    await setLineConfiguration({ bookingId: input.bookingId, lineId: line.id, source: 'studio', organizationId: orgId });
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
    .select('title, price, quantity, package_id')
    .eq('booking_id', bookingId)
    .eq('organization_id', orgId);

  // price × quantity — a line for "3 hours" is not billed as one hour.
  let total = 0;
  let currency = 'USD';
  for (const l of lines || []) {
    const p: any = l.price || {};
    total += Number(p.base_price || 0) * Number((l as any).quantity ?? 1);
    if (p.currency) currency = p.currency;
  }

  // Snapshot what's actually being sold, not just the total — a contract
  // that only states a price with no scope reads as a payment slip, not an
  // agreement. This is a snapshot like line prices already are: if the
  // booking's lines change later, this contract's terms don't silently
  // drift with them.
  const lineItems = (lines || []).map((l: any) => {
    const p: any = l.price || {};
    const quantity = Number(l.quantity ?? 1);
    const unitPrice = Number(p.base_price || 0);
    return { title: l.title, quantity, unit: p.unit || null, unitPrice, total: unitPrice * quantity };
  });

  // What's due to book — resolved from what's actually being sold, not
  // hardcoded. A package requiring full payment overrides everything else on
  // the booking (you can't half-confirm a full-payment line); otherwise the
  // largest deposit among the packages involved applies. Lines with no
  // package at all (custom lines only, nothing catalogued yet) get the most
  // conservative reading — nothing assumed due to book, the full amount
  // invoiced later — rather than a studio-configurable default that no
  // longer exists.
  const packageIds = [...new Set((lines || []).map((l: any) => l.package_id).filter(Boolean))] as string[];
  const policies = await getPaymentPoliciesForPackages(packageIds);
  const resolved = Object.values(policies) as { policy: string; depositPercentage: number }[];
  let depositPercentage: number;
  if (resolved.some((p) => p.policy === 'full')) {
    depositPercentage = 100;
  } else if (resolved.length > 0) {
    depositPercentage = Math.max(...resolved.map((p) => p.depositPercentage));
  } else {
    depositPercentage = 0;
  }

  const terms = { base_price: total, deposit_percentage: depositPercentage, currency, line_items: lineItems };

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

  // Which contract this invoice belongs to — the most recently created one
  // that's still open, so it shows up on that contract's own page. A booking
  // can have more than one contract once an earlier one is closed out; an
  // invoice raised with none open just isn't tied to a contract at all.
  const { data: bookingContracts } = await supabaseAdmin
    .from('contracts')
    .select('id, status, created_at')
    .eq('booking_id', input.bookingId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  const relevantContract = (bookingContracts || []).find((c: any) => !['completed', 'cancelled'].includes(c.status));

  // Ask Finances to raise it — Bookings never writes the money table.
  const { transactionId: txId } = await raiseInvoiceForBooking({
    organizationId: orgId,
    bookingId: input.bookingId,
    contactId: booking.contact_id ?? null,
    contractId: relevantContract?.id ?? null,
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
 * kernel is unlocked). The line IS the production unit: its tasks come from
 * the package's aggregated routing — the union of every Service it bundles —
 * asked of Packages and handed to Production.
 */
export async function startWorkForLine(input: { bookingId: string; lineId: string }) {
  const { orgId } = await getAuthOrgId();

  const { data: line } = await supabaseAdmin
    .from('booking_lines')
    .select('id, package_id')
    .eq('id', input.lineId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!line) throw new Error('Line not found');

  // Ask the Packages module for this line's production plan — never read its
  // tables from here (seam discipline).
  const plan = line.package_id
    ? await getProductionPlanForPackage(line.package_id)
    : { stages: [] };

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
export async function setBookingSchedule(input: {
  bookingId: string;
  scheduledFor: string | null;
  durationMinutes?: number | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const patch: Record<string, unknown> = { scheduled_for: input.scheduledFor };
  if (input.durationMinutes !== undefined) patch.duration_minutes = input.durationMinutes;

  const { error } = await supabaseAdmin
    .from('bookings')
    .update(patch)
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
    payload: { scheduledFor: input.scheduledFor, durationMinutes: input.durationMinutes },
  });

  await refreshBookingTitle(input.bookingId);

  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/calendar');
  return { ok: true };
}

/**
 * One booking, with everything its hub renders. The surface asks for this
 * rather than querying the table itself — same rule every other module's
 * consumers already follow, and the reason it was being broken here is simply
 * that this operation didn't exist yet.
 *
 * Contracts and transactions come back on the row because the booking IS where
 * they cohere; they stay owned by their own modules, which is why nothing here
 * writes them.
 */
export async function getBooking(bookingId: string) {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select(`
      id, title, scheduled_for, duration_minutes, created_at, stage_id,
      stage:booking_stages(id, name, kind, color),
      contact:contacts(id, display_name, email),
      booking_lines(id, title, price, quantity, package_id, status, created_at),
      contracts(id, version, status, terms, created_at),
      financial_transactions(id, type, amount, currency, status, direction)
    `)
    .eq('id', bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load booking:', error);
    throw new Error('Failed to load the booking');
  }
  if (!data) return null;

  const b: any = data;
  return {
    ...b,
    lines: (b.booking_lines || []).slice().sort((x: any, y: any) => String(x.created_at).localeCompare(String(y.created_at))),
    contracts: b.contracts || [],
    transactions: b.financial_transactions || [],
  };
}

/** Every booking, newest first — the list surface. */
export async function listBookings() {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select(`
      id, title, created_at,
      stage:booking_stages(name, kind, color),
      contact:contacts(display_name),
      booking_lines(id),
      contracts(id, status),
      financial_transactions(id, amount, status, currency)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to list bookings:', error);
    throw new Error('Failed to load bookings');
  }

  const rows = (data || []) as any[];
  return rows.map((b) => {
    // A transaction records the currency it was raised in. Summing them and
    // then labelling the total with the studio's *current* currency would
    // rename a dollar debt as naira, so the currency travels with the figure.
    const pending = (b.financial_transactions || []).filter((t: any) => t.status === 'pending');
    return {
      id: b.id as string,
      title: b.title as string,
      createdAt: b.created_at as string,
      stage: b.stage || null,
      clientName: b.contact?.display_name || null,
      lineCount: (b.booking_lines || []).length,
      hasContract: (b.contracts || []).length > 0,
      pendingTotal: pending.reduce((s: number, t: any) => s + Number(t.amount || 0), 0),
      pendingCurrency: (pending[0]?.currency as string | undefined) ?? null,
    };
  });
}

/**
 * Bookings scheduled within a window — the calendar's shoot layer. Carries just
 * enough context to be readable without opening the booking.
 */
export async function listBookingsInRange(fromISO: string, toISO: string) {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('id, title, scheduled_for, duration_minutes, stage:booking_stages(name, kind, color), contact:contacts(display_name), booking_lines(title)')
    .eq('organization_id', orgId)
    .not('scheduled_for', 'is', null)
    .gte('scheduled_for', fromISO)
    .lte('scheduled_for', toISO)
    .order('scheduled_for');
  if (error) {
    console.error('Failed to list bookings in range:', error);
    throw new Error('Failed to load the calendar');
  }

  const rows = (data || []) as any[];
  return rows.map((b) => ({
    kind: 'booking' as const,
    at: b.scheduled_for as string,
    durationMinutes: b.duration_minutes ?? null,
    bookingId: b.id,
    title: b.title,
    stage: b.stage?.name || null,
    stageKind: b.stage?.kind || null,
    stageColor: b.stage?.color || null,
    client: b.contact?.display_name || null,
    lines: (b.booking_lines || []).map((l: any) => l.title),
  }));
}

/**
 * How many bookings each contact has — the Clients list asks for this rather
 * than counting the bookings table itself. Returned as a plain map so the
 * caller doesn't need a query per row.
 */
export async function getBookingCountsByContact(): Promise<Record<string, number>> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('contact_id')
    .eq('organization_id', orgId)
    .not('contact_id', 'is', null);
  if (error) {
    console.error('Failed to count bookings by contact:', error);
    return {};
  }
  const counts: Record<string, number> = {};
  for (const b of (data || []) as any[]) {
    counts[b.contact_id] = (counts[b.contact_id] || 0) + 1;
  }
  return counts;
}

/** Every booking for one client — Clients asks this rather than reading the bookings table. */
export async function listBookingsForContact(contactId: string) {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('id, title, scheduled_for, created_at, stage:booking_stages(name, kind, color), booking_lines(price, quantity)')
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list bookings for contact:', error);
    return [];
  }

  return (data || []).map((b: any) => {
    let total = 0;
    let currency = 'USD';
    for (const l of b.booking_lines || []) {
      const p: any = l.price || {};
      total += Number(p.base_price || 0) * Number(l.quantity ?? 1);
      if (p.currency) currency = p.currency;
    }
    return {
      id: b.id,
      title: b.title,
      scheduledFor: b.scheduled_for,
      stageName: b.stage?.name || null,
      stageKind: b.stage?.kind || null,
      stageColor: b.stage?.color || null,
      total,
      currency,
    };
  });
}

// ── Stages: the studio's own lifecycle ──────────────────────────────────────

/**
 * A stage's name shows up wherever a booking does. Anything that changes the
 * stage list must invalidate all of those surfaces — including the dynamic
 * booking pages, which is what a bare revalidatePath('/bookings') misses.
 */
function revalidateStageSurfaces() {
  revalidatePath('/bookings/settings');
  revalidatePath('/bookings');
  revalidatePath('/bookings/[id]', 'page');
  revalidatePath('/calendar');
  revalidatePath('/overview');
}

export type StageKind = 'enquiry' | 'booked' | 'completed' | 'cancelled';

/** The studio's stages, in order. Consumers switch on `kind`, never on `name`. */
export async function listStages() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('booking_stages')
    .select('id, name, kind, color, position, is_default')
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
  revalidateStageSurfaces();
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

  revalidateStageSurfaces();
  return { ok: true };
}

/** Remove a stage. Bookings sitting on it move to the default stage. */
export async function deleteStage(stageId: string) {
  const { orgId } = await getAuthOrgId();

  const { data: stages } = await supabaseAdmin
    .from('booking_stages')
    .select('id, is_default, position')
    .eq('organization_id', orgId)
    .order('position');
  if ((stages || []).length <= 1) throw new Error('Keep at least one stage.');

  const fallback = (stages || []).find((s: any) => s.is_default && s.id !== stageId) || (stages || []).find((s: any) => s.id !== stageId);
  if (!fallback) throw new Error('No stage left to move bookings to.');

  await supabaseAdmin.from('bookings').update({ stage_id: fallback.id }).eq('organization_id', orgId).eq('stage_id', stageId);
  const { error } = await supabaseAdmin.from('booking_stages').delete().eq('id', stageId).eq('organization_id', orgId);
  if (error) throw new Error('Failed to remove the stage');

  // Removing the default would leave the studio without one — promote the
  // stage its bookings just moved to.
  const removedTheDefault = (stages || []).some((s: any) => s.id === stageId && s.is_default);
  if (removedTheDefault) {
    await supabaseAdmin
      .from('booking_stages')
      .update({ is_default: true })
      .eq('id', fallback.id)
      .eq('organization_id', orgId);
  }

  revalidateStageSurfaces();
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
  quantity?: number;
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
  if (input.quantity !== undefined) {
    const q = Number(input.quantity);
    if (!Number.isFinite(q) || q <= 0) throw new Error('Quantity must be more than zero.');
    patch.quantity = q;
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
 *   client + package  →  "Amara Obi — Wedding Gold"
 *   client            →  "Amara Obi"
 *   package + date    →  "Wedding Gold — 14 Jul"
 *   nothing yet       →  "New booking"
 * Extra lines are counted rather than listed, so the name stays readable.
 */
function composeTitle(input: {
  clientName?: string | null;
  lineTitles?: string[];
  scheduledFor?: string | null;
}) {
  const client = (input.clientName || '').trim();
  const lineTitles = (input.lineTitles || []).filter(Boolean);
  const day = formatDay(input.scheduledFor ?? null);

  let what = lineTitles[0] || '';
  if (lineTitles.length > 1) what += ` +${lineTitles.length - 1}`;

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
    lineTitles: lines.map((l: any) => l.title),
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

/** Pick the colour a stage shows in. Null returns it to the kind's default. */
export async function setStageColor(input: { stageId: string; color: string | null }) {
  const { orgId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('booking_stages')
    .update({ color: input.color })
    .eq('id', input.stageId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to set the colour');

  revalidateStageSurfaces();
  return { ok: true };
}

/**
 * Save a stage's name and colour together — one round trip for one edit.
 * (Trying colours is a local, instant thing; only the Save hits the server.)
 */
export async function updateStage(input: { stageId: string; name?: string; color?: string | null }) {
  const { orgId } = await getAuthOrgId();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Give the stage a name.');
    patch.name = name;
  }
  if (input.color !== undefined) patch.color = input.color;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabaseAdmin
    .from('booking_stages')
    .update(patch)
    .eq('id', input.stageId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to save the stage (does that name already exist?)');

  revalidateStageSurfaces();
  return { ok: true };
}

/** Choose which stage new bookings start on. Exactly one stage is the default. */
export async function setDefaultStage(stageId: string) {
  const { orgId } = await getAuthOrgId();

  const { data: stage } = await supabaseAdmin
    .from('booking_stages').select('id').eq('id', stageId).eq('organization_id', orgId).maybeSingle();
  if (!stage) throw new Error('Stage not found');

  await supabaseAdmin.from('booking_stages').update({ is_default: false }).eq('organization_id', orgId).neq('id', stageId);
  const { error } = await supabaseAdmin
    .from('booking_stages').update({ is_default: true }).eq('id', stageId).eq('organization_id', orgId);
  if (error) throw new Error('Failed to set the starting stage');

  revalidateStageSurfaces();
  return { ok: true };
}

/**
 * Which intake questions for a package already have answers on real bookings.
 *
 * Packages asks this before letting a studio change a question's TYPE: once a
 * client has answered, changing the type would corrupt the stored value. The
 * answers live here (booking metadata), the questions live in Packages — so
 * this is the seam between them.
 */
export async function getAnsweredQuestionIdsForPackage(packageId: string): Promise<string[]> {
  const { orgId } = await getAuthOrgId();

  const { data: rows } = await supabaseAdmin
    .from('bookings')
    .select('metadata, booking_lines!inner(package_id)')
    .eq('organization_id', orgId)
    .eq('booking_lines.package_id', packageId);

  const ids = new Set<string>();
  for (const r of (rows || []) as any[]) {
    const answers = r.metadata?.form_responses;
    if (answers && typeof answers === 'object') {
      for (const [qid, value] of Object.entries(answers)) {
        const empty = value === null || value === undefined || value === '' ||
          (Array.isArray(value) && value.length === 0);
        if (!empty) ids.add(qid);
      }
    }
  }
  return Array.from(ids);
}

/**
 * What the client told us when they booked — the answers, paired with the
 * questions that produced them.
 *
 * This closes a loop that was half-built: intake answers were collected on the
 * public form and stored, but no surface ever showed them. Questions belong to
 * Packages, so we ask for them per package; answers whose question has since
 * been removed are kept and marked, because a client genuinely said that.
 */
export async function getIntakeAnswersForBooking(bookingId: string) {
  const { orgId } = await getAuthOrgId();

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('metadata, booking_lines(package_id)')
    .eq('id', bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();

  const answers = (booking?.metadata as any)?.form_responses;
  if (!answers || typeof answers !== 'object') return [];

  // The questions come from Packages — never read its tables from here.
  const { getIntakeQuestions } = await import('@/modules/packages/interface');
  const packageIds = Array.from(
    new Set(((booking as any).booking_lines || []).map((l: any) => l.package_id).filter(Boolean))
  ) as string[];

  const questions = (await Promise.all(packageIds.map((id) => getIntakeQuestions(id)))).flat();
  const byId = new Map(questions.map((q) => [q.id, q]));

  const { fieldType } = await import('@/modules/services/fieldTypes');

  const rows: { label: string; value: string; removed: boolean }[] = [];
  // Asked questions first, in the order the studio arranged them.
  for (const q of questions) {
    if (!(q.id in answers)) continue;
    const v = answers[q.id];
    const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) continue;
    rows.push({ label: q.label, value: fieldType(q.type).display(v), removed: false });
  }
  // Then anything answered whose question has since been removed.
  for (const [qid, v] of Object.entries(answers)) {
    if (qid === 'message' || qid === 'dimensions') continue;
    if (byId.has(qid)) continue;
    const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) continue;
    rows.push({ label: 'Question removed', value: Array.isArray(v) ? v.join(', ') : String(v), removed: true });
  }

  // Handle custom enquiries that have direct message and/or dimensions
  if (answers.message) {
    rows.push({ label: 'Message', value: answers.message, removed: false });
  }
  
  if (answers.dimensions && typeof answers.dimensions === 'object') {
    // Read the display names for these UUIDs from the config
    const { getPublicIntakeDimensions } = await import('@/modules/services/interface');
    const dimConfig = await getPublicIntakeDimensions(orgId);
    
    const LABELS: Record<string, string> = {
      subject: 'Subject',
      occasion: 'Occasion',
      context: 'Setting',
      purpose: 'Purpose',
      client: 'Client type',
    };
    
    for (const [dimKey, valueId] of Object.entries(answers.dimensions)) {
      if (!valueId) continue;
      const opts = dimConfig.values[dimKey] || [];
      const opt = opts.find((o) => o.id === valueId);
      if (opt) {
        rows.push({ label: LABELS[dimKey] || dimKey, value: opt.name, removed: false });
      }
    }
  }

  return rows;
}

export async function extractPackageFromEnquiry(bookingId: string) {
  const { orgId } = await getAuthOrgId();

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, metadata')
    .eq('id', bookingId)
    .eq('organization_id', orgId)
    .single();

  if (!booking) throw new Error('Booking not found');

  const dimensions = (booking.metadata as any)?.form_responses?.dimensions;
  if (!dimensions || typeof dimensions !== 'object') {
    throw new Error('No dimensions found in custom request');
  }

  // Look up dimension names
  const { getPublicIntakeDimensions } = await import('@/modules/services/interface');
  const dimConfig = await getPublicIntakeDimensions(orgId);

  const resolveName = (key: string) => {
    const id = dimensions[key];
    if (!id) return null;
    return dimConfig.values[key]?.find(v => v.id === id)?.name || null;
  };

  const occasion = resolveName('occasion');
  const context = resolveName('context');
  const subject = resolveName('subject');
  const purpose = resolveName('purpose');
  const clientType = resolveName('client');

  // Build a smart name for the service
  const serviceName = [occasion, subject, context].filter(Boolean).join(' ') || 'Custom Service';

  // Create the Service
  const { createService } = await import('@/modules/services/interface');
  const { serviceId } = await createService({
    name: serviceName,
    occasions: occasion ? [occasion] : [],
    contexts: context ? [context] : [],
    subjects: subject ? [subject] : [],
    purposes: purpose ? [purpose] : [],
    clientTypes: clientType ? [clientType] : [],
  });

  // Create the Package
  const { createPackage } = await import('@/modules/packages/interface');
  const { packageId } = await createPackage({
    name: `Custom: ${serviceName}`,
    serviceIds: [serviceId],
  });

  // Add the package line to the booking
  await addBookingLine({
    bookingId: booking.id,
    packageId,
    title: `Custom: ${serviceName}`,
  });

  revalidatePath('/bookings');
  revalidatePath(`/bookings/${booking.id}`);
  return { packageId };
}

/**
 * Who this booking needs, derived from what was actually booked.
 *
 * The whole chain already exists in the data and used to die before reaching
 * anyone: a Service's Blueprint routes each stage to a role → a Package
 * inherits the union of its bundled Services' stages → a booking line points
 * at that Package. So the booking already knows it needs a Photographer and a
 * Video Editor; nothing ever said so out loud until work had been started and
 * the roles were buried one-per-task.
 *
 * Surfaced, never acted on — the same discipline as reviewCascadeForCancel.
 * This does not assign anyone, and a role going unfilled is not an error: a
 * studio may well shoot it themselves. Roles are matched by id, not name, and
 * stages the blueprints left unrouted are reported rather than hidden, because
 * "the blueprint doesn't say who does this" is real information.
 */
export async function getStaffingNeedsForBooking(bookingId: string): Promise<{
  roles: { roleId: string; roleName: string; stageCount: number; fromPackages: string[]; assigned: { employeeId: string; name: string }[] }[];
  unroutedStages: number;
}> {
  const { orgId } = await getAuthOrgId();

  const { data: lines } = await supabaseAdmin
    .from('booking_lines')
    .select('package_id, title')
    .eq('organization_id', orgId)
    .eq('booking_id', bookingId);

  const withPackage = ((lines || []) as any[]).filter((l) => l.package_id);
  if (withPackage.length === 0) return { roles: [], unroutedStages: 0 };

  // Asked of Packages — its plan is already the union of every bundled
  // Service's Process, so this never needs to know Services exist.
  const { getProductionPlanForPackage } = await import('@/modules/packages/interface');

  const byRole = new Map<string, { stageCount: number; fromPackages: Set<string> }>();
  let unroutedStages = 0;

  // A package booked twice genuinely needs its roles twice over, so this walks
  // lines rather than distinct packages.
  for (const line of withPackage) {
    const plan = await getProductionPlanForPackage(line.package_id);
    for (const stage of plan.stages) {
      if (!stage.roleId) { unroutedStages += 1; continue; }
      const entry = byRole.get(stage.roleId) ?? { stageCount: 0, fromPackages: new Set<string>() };
      entry.stageCount += 1;
      entry.fromPackages.add(line.title);
      byRole.set(stage.roleId, entry);
    }
  }
  if (byRole.size === 0) return { roles: [], unroutedStages };

  // Names from Team, crew from Production — both through their interfaces.
  const [{ listRoles }, { listCrewForBooking }] = await Promise.all([
    import('@/modules/team/interface'),
    import('@/modules/production/interface'),
  ]);
  const [allRoles, crew] = await Promise.all([listRoles(), listCrewForBooking(bookingId)]);
  const roleName = new Map((allRoles as any[]).map((r) => [r.id, r.name as string]));

  const roles = Array.from(byRole.entries())
    .map(([roleId, v]) => ({
      roleId,
      roleName: roleName.get(roleId) || 'Unnamed role',
      stageCount: v.stageCount,
      fromPackages: Array.from(v.fromPackages),
      assigned: (crew as any[])
        .filter((m) => m.roleId === roleId)
        .map((m) => ({ employeeId: m.employeeId as string, name: m.name as string })),
    }))
    .sort((a, b) => b.stageCount - a.stageCount || a.roleName.localeCompare(b.roleName));

  return { roles, unroutedStages };
}

/**
 * What this booking's lines suggest it should run for — the longest of their
 * packages' typical durations, since work on one day usually overlaps rather
 * than stacking. A suggestion only: the studio sets the real figure.
 */
export async function suggestedDurationForBooking(bookingId: string): Promise<number | null> {
  const { orgId } = await getAuthOrgId();

  const { data: lines } = await supabaseAdmin
    .from('booking_lines')
    .select('package_id')
    .eq('organization_id', orgId)
    .eq('booking_id', bookingId);

  const packageIds = (lines || []).map((l: any) => l.package_id).filter(Boolean) as string[];
  if (packageIds.length === 0) return null;

  const durations = await Promise.all(packageIds.map(async (id) => (await getPackageForBooking(id))?.duration_minutes ?? null));
  const known = durations.filter((d): d is number => typeof d === 'number' && d > 0);
  return known.length ? Math.max(...known) : null;
}
