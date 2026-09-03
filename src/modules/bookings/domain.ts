'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertOurs } from '@/kernel/tenancy';
import { studioHoursFor, localInstant, studioTimezone } from '@/kernel/studioHours';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { amountOf, firstPriced, hasPrice } from '@/kernel/money';
import { getStudioCurrency } from '@/kernel/organizations';
import { getPackageForBooking, getPackageVariables } from '@/modules/packages/interface';
import { draftContractForBooking, getDepositDefault } from '@/modules/contracts/interface';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
// One definition of what a deliverable link looks like, shared by every reader.
import { PACKAGE_PROMISE_NAMED } from '@/modules/deliverables/shape';

/**
 * Create a booking. A title alone is enough — everything else (client, lines,
 * contract, money, work) associates later, in any order. This is the hub that
 * independent things cohere around, not a wizard step.
 */
/**
 * When a booking actually happens, from what somebody typed.
 *
 * THE BUG THIS FIXES. The public form sent `new Date(value).toISOString()`,
 * and the value from an <input type="datetime-local"> carries no zone — so
 * JavaScript read it in the BROWSER's zone. A client booking from London for a
 * Lagos studio picked 10:00 and the studio recorded 11:00. The wall clock never
 * reached the server, so nothing downstream could correct it. Now the string
 * arrives as typed and is resolved here, in the studio's own zone, by Postgres,
 * which knows the offset that applied on that date.
 *
 * WHY THE HOURS CHECK LIVES HERE TOO. Both questions need the same two pieces —
 * the studio's day and the studio's zone — and asking them together means a
 * booking cannot be resolved without also being examined.
 *
 * ENFORCED FOR THE PUBLIC, NOT FOR THE STUDIO. A stranger on a booking page
 * must not be able to choose a time the studio said it is closed; that is what
 * publishing hours means. The studio itself is never blocked — a weekend shoot
 * on a day the doors are shut is ordinary, and an operating system that argues
 * with the operator about their own diary is wrong. Their out-of-hours booking
 * simply stands.
 *
 * Accepts what is already an instant, unchanged. Anything with a zone in it was
 * resolved by someone who knew what they meant.
 */
async function resolveScheduledFor(
  orgId: string,
  value: string | null | undefined,
  opts: { enforceHours: boolean },
): Promise<string | null> {
  const raw = (value || '').trim();
  if (!raw) return null;

  // "2026-08-29T10:00" — a wall clock, no zone. Anything else (a Z, an offset)
  // is already an instant and is taken as given.
  const wall = raw.match(/^(\d{4}-\d{2}-\d{2})T([012]\d:[0-5]\d)/);
  if (!wall) return raw;
  const [, date, time] = wall;

  if (opts.enforceHours) {
    const hours = await studioHoursFor(orgId, date);
    const when = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));

    if (hours.closed) {
      throw new Error(
        hours.label
          ? `The studio is closed on ${when} (${hours.label}). Please choose another day.`
          : `The studio is closed on ${when}. Please choose another day.`,
      );
    }
    // Compared as wall clocks inside one studio day, so no timezone arithmetic
    // reaches this decision. A studio that has not stated its hours constrains
    // nothing, which is the same answer it gives everywhere else.
    if (hours.opensAt && time < hours.opensAt) {
      throw new Error(`The studio opens at ${hours.opensAt} on ${when}. Please choose a later time.`);
    }
    if (hours.closesAt && time >= hours.closesAt) {
      throw new Error(`The studio closes at ${hours.closesAt} on ${when}. Please choose an earlier time.`);
    }
  }

  return localInstant(date, time, await studioTimezone(orgId));
}

/**
 * WHAT A DAY IS LIKE, BEFORE ANYTHING IS COMMITTED TO IT.
 *
 * resolveScheduledFor already refuses a closed day and an out-of-hours time on
 * the intake path, and that stays: a rule enforced only in the browser is not
 * enforced. But it throws at SUBMIT, which is the far end of a form somebody
 * has just filled in — the same shape as a contract that could not be raised
 * being discovered after the booking was saved.
 *
 * So the same answer is readable before the choosing, and the throw becomes the
 * backstop it should have been all along.
 *
 * Takes the org explicitly because a visitor to a storefront has no session,
 * and returns only what a studio publishes about itself. Nothing here says
 * anything about anyone else's booking.
 */
export async function studioDayPublic(orgId: string, date: string) {
  return studioHoursFor(orgId, date);
}

/** The same, from a session. */
export async function studioDay(date: string) {
  const { orgId } = await getAuthOrgId();
  return studioHoursFor(orgId, date);
}

/**
 * WHAT ELSE IS ALREADY ON THAT DAY.
 *
 * Nothing anywhere checked this: two bookings could hold the same Saturday at
 * two o'clock and neither would mention the other.
 *
 * IT REPORTS RATHER THAN REFUSES, deliberately. Whether a studio can run two
 * shoots at once is a fact about that studio — how many photographers, how many
 * rooms — and this system has not been told it. Inventing a capacity rule would
 * mean inventing the number behind it, and a booking wrongly refused is worse
 * than one taken with open eyes. So the operator is shown what is already
 * there, with times and stages, and decides.
 *
 * OPERATOR ONLY. It names other clients' bookings, so it takes a session and is
 * never reachable from a storefront. The public read above deliberately answers
 * a different, narrower question.
 */
export async function whatElseIsOn(date: string, exceptBookingId?: string) {
  const { orgId } = await getAuthOrgId();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const zone = await studioTimezone(orgId);
  // The day's own edges, in the studio's zone, so "that day" means the day the
  // studio is having and not the day the server happens to be having.
  const from = await localInstant(date, '00:00', zone);
  const to = await localInstant(date, '23:59', zone);

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('id, title, scheduled_for, duration_minutes, stage:booking_stages(name, kind)')
    .eq('organization_id', orgId)
    .not('scheduled_for', 'is', null)
    .gte('scheduled_for', from)
    .lte('scheduled_for', to)
    .order('scheduled_for');
  if (error) {
    console.error('Failed to read what else is on:', error);
    return [];
  }

  return ((data || []) as any[])
    .filter((b) => b.id !== exceptBookingId)
    .map((b) => ({
      bookingId: b.id as string,
      title: (b.title || 'Untitled booking') as string,
      at: b.scheduled_for as string,
      durationMinutes: (b.duration_minutes ?? null) as number | null,
      stage: (b.stage?.name ?? null) as string | null,
      stageKind: (b.stage?.kind ?? null) as string | null,
    }));
}

export async function createBooking(input: {
  contactId?: string | null;
  lines?: {
    packageId?: string | null;
    linePrice?: Record<string, unknown>;
    title?: string;
    variableAnswers?: { serviceVariableId: string; value: unknown }[];
  }[];
  scheduledFor?: string | null;
  title?: string;
  /**
   * What the client asked for, in their own words — the question this booking
   * is an answer to. Recorded, never parsed: the moment any of it is worth
   * structuring, it belongs in dimensions instead.
   */
  brief?: string | null;
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

  await assertOurs(orgId, [{ table: 'contacts', id: input.contactId, label: 'client' }]);
  // The studio scheduling its own work is never told it may not.
  const scheduledFor = await resolveScheduledFor(orgId, input.scheduledFor, { enforceHours: false });

  // The name is composed from what's known — the studio never invents one.
  const custom = (input.title || '').trim();
  let clientName: string | null = null;
  if (input.contactId) {
    const { data: c } = await supabaseAdmin
      .from('contacts').select('display_name').eq('id', input.contactId).eq('organization_id', orgId).maybeSingle();
    clientName = c?.display_name ?? null;
  }
  const pkgNames = [];
  if (input.lines) {
    for (const line of input.lines) {
      if (line.packageId) {
        const pkg = await getPackageForBooking(line.packageId);
        if (pkg?.name) pkgNames.push(pkg.name);
      }
    }
  }
  const title = custom || composeTitle({
    clientName,
    lineTitles: pkgNames,
    scheduledFor,
  });

  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .insert({
      organization_id: orgId,
      title,
      title_custom: !!custom,
      stage_id: defaultStage.id,
      contact_id: input.contactId ?? null,
      scheduled_for: scheduledFor,
      brief: (input.brief || '').trim() || null,
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

  // Create lines.
  if (input.lines) {
    for (const line of input.lines) {
      if (line.packageId) {
        await addBookingLine({ 
          bookingId: booking.id, 
          packageId: line.packageId, 
          title: line.title || '', 
          price: line.linePrice,
          variableAnswers: line.variableAnswers,
        });
      }
    }
  }

  revalidatePath('/bookings');
  revalidatePath('/calendar');
  return { bookingId: booking.id };
}

/**
 * A booking arriving from outside — the public booking page. It is the same
 * booking as any other; the only real difference is that nobody is logged in,
 * so the organization comes in explicitly instead of from a session (the
 * pattern draftContractForBooking already uses).
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
  /**
   * The package this booking is for — already instantiated by Packages, never
   * a catalog id. Bookings does not clone it and does not write to it; asking
   * Packages for an instance is the caller's job, done before this is called.
   */
  packageId?: string | null;
  packageName: string;
  /**
   * What the instance costs, as Packages reported it when it made the instance.
   *
   * Copied onto the line rather than read back off the package: the line's own
   * columns are still what older bookings are made of, and every read here
   * falls back to them. It is a copy, never a source — Bookings does not write
   * to packages.
   */
  linePrice?: Record<string, unknown>;
  answers?: Record<string, unknown>;
  /** What the client chose for whatever the package left open. */
  variableAnswers?: { serviceVariableId: string; value: unknown }[];
  source?: string;
  scheduledFor?: string | null;
}) {
  const orgId = input.organizationId;
  // The public form has no session, so this is self-consistency rather than
  // authorisation: the contact and package must belong to the studio whose
  // booking page was filled in.
  await assertOurs(orgId, [
    { table: 'contacts', id: input.contactId, label: 'client' },
    { table: 'packages', id: input.packageId, label: 'package' },
  ]);

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

  /*
   * A stranger picked this time on a public page, so it is checked against the
   * hours the studio published. Before the stage is chosen and before anything
   * is written, so a refusal leaves nothing behind.
   */
  const scheduledFor = await resolveScheduledFor(orgId, input.scheduledFor, { enforceHours: true });

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
      scheduled_for: scheduledFor,
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
    .select('variable_id, value, source')
    .eq('organization_id', orgId)
    .eq('booking_line_id', input.lineId);
  const existing = (existingRows || []) as any[];

  await supabaseAdmin
    .from('booking_line_variable_values')
    .delete()
    .eq('organization_id', orgId)
    .eq('booking_line_id', input.lineId);

  type Row = { organization_id: string; booking_line_id: string; variable_id: string; value: unknown; source: string };

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
        variable_id: e.variable_id,
        value: e.value,
        source: e.source,
      });
    }
  } else if (line.package_id) {
    // First configuration: inherit whatever the package fixed, snapshotted.
    // Read through the bundle, since a fixed value belongs to a service inside
    // the package rather than to the package.
    const { data: fixed } = await supabaseAdmin
      .from('package_services')
      .select('package_variable_values(variable_id, value)')
      .eq('organization_id', orgId)
      .eq('package_id', line.package_id);
    // A line's configuration is keyed by variable, so bundling the same service
    // twice fixes the variable twice and only the first can be carried. The
    // snapshot cannot express "2 outfits on day one, 3 on day two" — noted
    // rather than solved, because solving it belongs to the booking line.
    const taken = new Set<string>();
    for (const row of ((fixed || []) as any[])) {
      for (const f of (row.package_variable_values || [])) {
        if (taken.has(f.variable_id)) continue;
        taken.add(f.variable_id);
        inherited.push({
          organization_id: orgId,
          booking_line_id: input.lineId,
          variable_id: f.variable_id,
          value: f.value,
          source: 'package',
        });
      }
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
      variable_id: a.serviceVariableId,
      value: a.value,
      source: input.source || 'client',
    });
  }
  const cleared = new Set(input.clear || []);
  const rows = [
    ...inherited.filter((r) => !answered.has(r.variable_id) && !cleared.has(r.variable_id)),
    ...answers.filter((r) => !cleared.has(r.variable_id)),
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
    .select('value, source, variable:variables(id, key, label, unit, position)')
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
      serviceId: v.serviceId as string,
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
      serviceId: h.serviceVariableId, // Not strictly true, but a fallback for orphaned variables
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
export async function setBookingClient(input: { bookingId: string; contactId: string | null }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  // null detaches. A booking can always exist without a client — that's the
  // whole point of taking one before you know who it's for — so the wrong
  // person being attached has to be undoable, not just replaceable.
  let contact: { id: string; display_name: string } | null = null;
  if (input.contactId) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('id, display_name, metadata')
      .eq('id', input.contactId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!data) throw new Error('Contact not found');
    contact = data as any;
  }

  const { error } = await supabaseAdmin
    .from('bookings')
    .update({ contact_id: contact?.id ?? null })
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
    action: contact ? 'client_set' : 'client_cleared',
    actorId: actorId ?? undefined,
    payload: contact ? { contactId: contact.id, name: contact.display_name } : {},
  });

  await refreshBookingTitle(input.bookingId);
  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/**
 * Add a package line to a booking. Optionally seeded from a Package (which
 * carries its price snapshot); or a free-form custom line.
 */

async function copyPackageTasksToBookingLine(orgId: string, packageId: string, bookingLineId: string, bookingId: string) {
  const { data: packageTasks } = await supabaseAdmin
    .from('package_services')
    .select('id, package_tasks(id, name, role_id, position, is_active, workflow_task_id)')
    .eq('organization_id', orgId)
    .eq('package_id', packageId);

  if (!packageTasks || packageTasks.length === 0) return;

  const tasksToInsert: any[] = [];
  for (const p of packageTasks) {
    for (const t of (p.package_tasks || [])) {
      if (t.is_active) {
        tasksToInsert.push({
          organization_id: orgId,
          // The booking owns the work; the line records which package it came
          // from. A booking with three packages has one task list, not three.
          booking_id: bookingId,
          booking_line_id: bookingLineId,
          package_service_id: p.id,
          workflow_task_id: t.workflow_task_id,
          name: t.name,
          role_id: t.role_id,
          position: t.position
        });
      }
    }
  }

  if (tasksToInsert.length > 0) {
    await supabaseAdmin.from('booking_tasks').insert(tasksToInsert);
  }
}

export async function addBookingLine(input: {
  bookingId: string;
  packageId?: string | null;
  title: string;
  price?: Record<string, unknown>;
  quantity?: number;
  variableAnswers?: { serviceVariableId: string; value: unknown }[];
}) {
  const { orgId, personId } = await getAuthOrgId();
  await assertOurs(orgId, [
    { table: 'bookings', id: input.bookingId, label: 'booking' },
    { table: 'packages', id: input.packageId, label: 'package' },
  ]);

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
        price = { ...((pkg.price as Record<string, unknown>) || {}) };
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
    await setLineConfiguration({ 
      bookingId: input.bookingId, 
      lineId: line.id, 
      answers: input.variableAnswers,
      source: 'studio', 
      organizationId: orgId 
    });
    await copyPackageTasksToBookingLine(orgId, input.packageId, line.id, input.bookingId);
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
export async function createContractForBooking(
  bookingId: string,
  options?: {
    /** What to ask for up front on THIS contract, when it differs from the studio's default. */
    depositPercentage?: number | null;
    /**
     * The wording of THIS agreement.
     *
     * A contract is a document of terms, and the terms are the words. The
     * studio's standing text is what a booking starts from, not what it is
     * stuck with: this is the place a studio says what was actually agreed for
     * this job. Omitted means use the standing text.
     */
    agreementText?: string | null;
  },
) {
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
    .select('title, price, quantity, package_id, package:packages(name, price)')
    .eq('booking_id', bookingId)
    .eq('organization_id', orgId);

  // What this line is for and what was agreed for it. The booking's own
  // instance of the package holds both; a line made before instancing holds
  // them itself, and a contract must state a price either way.
  const nameOf = (l: any) => (l.package?.name as string) || (l.title as string) || 'Booking line';
  const priceOfLine = (l: any) => firstPriced(l.package?.price, l.price);

  /*
   * A contract states a scope and a price. Neither can be guessed.
   *
   * With nothing on the booking this drafted an agreement to do nothing for
   * nothing, and with an unpriced line it listed that line in the scope while
   * leaving it out of the total — a document a client could sign believing five
   * things were covered by a figure that paid for four. `amountOf` answers 0 for
   * an unset price, which is right for a total and wrong for an agreement.
   *
   * Refused in both cases rather than clamped, the rule the invoice follows too.
   * An invoice may drop an unpriced line because a signature must not fail over
   * one; a contract may not, because the scope IS the contract.
   */
  if ((lines || []).length === 0) {
    throw new Error('There is nothing on this booking yet, so there is nothing to agree to. Add a package first.');
  }
  const unpriced = (lines || []).filter((l: any) => !hasPrice(priceOfLine(l)));
  if (unpriced.length > 0) {
    throw new Error(
      `${unpriced.map((l: any) => `“${nameOf(l)}”`).join(' and ')} ` +
      `${unpriced.length === 1 ? 'has no price' : 'have no price'} yet. ` +
      'A contract has to state what is being agreed and what it costs, so price it on the booking first.',
    );
  }

  // price × quantity — a line for "3 hours" is not billed as one hour.
  // The currency comes off the lines, which are now known to carry one; the
  // studio's own is the fallback rather than a hardcoded 'USD' that quietly
  // renamed a Nigerian studio's money.
  let total = 0;
  let currency: string | null = null;
  for (const l of lines || []) {
    const p: any = priceOfLine(l);
    total += amountOf(p) * Number((l as any).quantity ?? 1);
    if (!currency && p.currency) currency = p.currency;
  }
  if (!currency) currency = await getStudioCurrency();

  // Snapshot what's actually being sold, not just the total — a contract
  // that only states a price with no scope reads as a payment slip, not an
  // agreement. This is a snapshot like line prices already are: if the
  // booking's lines change later, this contract's terms don't silently
  // drift with them.
  const lineItems = (lines || []).map((l: any) => {
    const p: any = priceOfLine(l);
    const quantity = Number(l.quantity ?? 1);
    const unitPrice = amountOf(p);
    return { title: nameOf(l), quantity, unit: p.unit || null, unitPrice, total: unitPrice * quantity };
  });

  // What's due to book, asked of Contracts. It used to be resolved from the
  // packages — each carrying its own payment policy, strictest winning — until
  // payment terms moved off the package, and the number was left hardcoded to
  // zero here in the meantime. A deposit is a term of the agreement, so the
  // studio's default belongs to the module that owns agreements, and this
  // contract can still be amended away from it afterwards.
  /*
   * What is due to book. The studio's standing answer unless this contract says
   * otherwise — a deposit is a term of the agreement, so a single agreement is
   * allowed to depart from the default without changing it for everyone.
   */
  const override = options?.depositPercentage;
  const depositPercentage = override == null || !Number.isFinite(Number(override))
    ? await getDepositDefault()
    : Math.min(100, Math.max(0, Number(override)));

  /*
   * The words, and the figures they are about.
   *
   * agreement_text is the contract; base_price and line_items are the booking's
   * own numbers snapshotted beside it, so the document cannot drift when the
   * booking changes afterwards. Only included when this booking said something,
   * so an untouched form still gets the studio's standing terms.
   */
  const terms: Record<string, unknown> = {
    base_price: total, deposit_percentage: depositPercentage, currency, line_items: lineItems,
  };
  if (typeof options?.agreementText === 'string') terms.agreement_text = options.agreementText;

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

/** Set (or clear) when this booking happens. */
export async function setBookingSchedule(input: {
  bookingId: string;
  scheduledFor: string | null;
  durationMinutes?: number | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  // Resolved in the studio's zone so a time typed here means the same thing as
  // a time typed on the booking page. Not enforced: this is the studio's diary.
  const scheduledFor = await resolveScheduledFor(orgId, input.scheduledFor, { enforceHours: false });

  const patch: Record<string, unknown> = { scheduled_for: scheduledFor };
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
    action: scheduledFor ? 'scheduled' : 'unscheduled',
    actorId: actorId ?? undefined,
    payload: { scheduledFor, durationMinutes: input.durationMinutes },
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
      id, title, brief, scheduled_for, duration_minutes, created_at, stage_id,
      share_token, shared_at, cover_url, cover_position,
      stage:booking_stages(id, name, kind, color),
      contact:contacts(id, display_name, email),
      booking_lines(
        id, title, price, quantity, package_id, created_at,
        package:packages(
          id, name, price,
          package_services(id, service:services(id, name, service_domain_id))
        ),
        tasks:booking_tasks(
          id, name, completed_at, package_service_id, position, workflow_task_id,
          assignee:contacts(id, display_name),
          role:roles(id, name)
        )
      ),
      contracts(id, version, status, terms, created_at),
      financial_transactions(id, type, amount, currency, status, direction)
    `)
    .eq('id', bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load booking:', JSON.stringify(error, null, 2), error);
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
      id, title, created_at, scheduled_for,
      stage:booking_stages(id, name, kind, color),
      contact:contacts(display_name),
      booking_lines(id),
      contracts(id, status),
      financial_transactions(id, amount, status, currency)
    `)
    .eq('organization_id', orgId)
    /*
     * WHEN THE WORK IS, NOT WHEN THE ROW WAS TYPED.
     *
     * This asked for created_at and did not ask for scheduled_for at all, so
     * the bookings list could not show the date of a single booking and was
     * ordered by the moment somebody opened the form. A studio scanning its
     * bookings is asking what is coming up; the order answered a question
     * nobody had.
     *
     * Nulls last, because a booking with no date yet is a real and ordinary
     * state — that is what taking one with whatever you know means — and it
     * belongs after the work that is actually scheduled rather than above it.
     */
    .order('scheduled_for', { ascending: false, nullsFirst: false })
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
      scheduledFor: (b.scheduled_for ?? null) as string | null,
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
    .select('id, title, scheduled_for, duration_minutes, stage:booking_stages(name, kind, color), contact:contacts(display_name), booking_lines(title, package:packages(name))')
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
    // Falling back to the line's own title: bookings made before a line pointed
    // at a package still carry their name there, and seven of them are named
    // nothing else at all.
    lines: (b.booking_lines || []).map((l: any) => l.package?.name || l.title).filter(Boolean),
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
    .select('id, title, scheduled_for, created_at, stage:booking_stages(name, kind, color), booking_lines(quantity, price, package:packages(price))')
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
      // The instance's price is the agreed one; the line's own is what older
      // bookings have instead of an instance.
      const priced = firstPriced(l.package?.price, l.price);
      const p: any = priced || {};
      total += amountOf(priced) * Number(l.quantity ?? 1);
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
 * Save the booking's own record — the fields that live on the booking row
 * itself — in one go, for the edit page's single Save.
 *
 * This composes the three operations that already own these fields rather
 * than writing a fourth path to the same columns. Each keeps its own
 * validation and logs its own event, so a save that changes the date and the
 * client still reads as two facts in the log, which is what happened. Only
 * what actually differs is touched: re-saving an untouched form writes
 * nothing and logs nothing, so the activity feed doesn't fill with renames
 * that renamed nothing.
 *
 * The brief is the exception: no other operation owns that column, so it is
 * written here — and it logs its own event like the rest.
 */
export async function updateBookingRecord(input: {
  bookingId: string;
  title?: string;
  contactId?: string | null;
  scheduledFor?: string | null;
  durationMinutes?: number | null;
  brief?: string | null;
  coverUrl?: string | null;
  coverPosition?: string | null;
}) {
  const { orgId, personId } = await getAuthOrgId();

  const { data: current } = await supabaseAdmin
    .from('bookings')
    .select('id, title, brief, contact_id, scheduled_for, duration_minutes')
    .eq('id', input.bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!current) throw new Error('Booking not found');

  const changed: string[] = [];

  if (input.title !== undefined && input.title.trim() && input.title.trim() !== current.title) {
    await renameBooking({ bookingId: input.bookingId, title: input.title });
    changed.push('title');
  }

  // `undefined` means the caller isn't touching the client; `null` means detach.
  if (input.contactId !== undefined && (input.contactId || null) !== (current.contact_id || null)) {
    await setBookingClient({ bookingId: input.bookingId, contactId: input.contactId || null });
    changed.push('client');
  }

  // Compared as instants, not strings: the form sends a datetime-local value
  // and the column holds a timestamptz, so the same moment spells differently.
  const t = (v: string | null | undefined) => (v ? new Date(v).getTime() : null);
  const dateMoved = input.scheduledFor !== undefined && t(input.scheduledFor) !== t(current.scheduled_for);
  const durationMoved = input.durationMinutes !== undefined
    && (input.durationMinutes ?? null) !== (current.duration_minutes ?? null);
  if (dateMoved || durationMoved) {
    await setBookingSchedule({
      bookingId: input.bookingId,
      scheduledFor: input.scheduledFor !== undefined ? input.scheduledFor : current.scheduled_for,
      durationMinutes: input.durationMinutes !== undefined ? input.durationMinutes : current.duration_minutes,
    });
    changed.push('schedule');
  }

  // Trimmed on both sides of the comparison, so emptying the box clears the
  // column rather than storing whitespace that reads as a brief.
  if (input.brief !== undefined) {
    const brief = (input.brief || '').trim() || null;
    if (brief !== (current.brief ?? null)) {
      const { error } = await supabaseAdmin
        .from('bookings')
        .update({ brief })
        .eq('id', input.bookingId)
        .eq('organization_id', orgId);
      if (error) throw new Error('Failed to save what the client asked for.');
      // The text itself stays out of the payload — it is prose, and the log
      // records that it changed, not a second copy of it.
      await logEvent({
        organizationId: orgId,
        entityType: 'booking',
        entityId: input.bookingId,
        action: 'brief_updated',
        actorId: personId ?? undefined,
        payload: { cleared: brief === null },
      });
      changed.push('brief');
    }
  }

  // Cover is a visual attribute of the booking row — no existing operation owns
  // it, so it is written here directly. Either field may be updated alone:
  // `coverPosition` changes without touching the URL when the operator drags
  // the focal point; a new image resets the position.
  const coverPatch: Record<string, string | null> = {};
  if (input.coverUrl !== undefined) coverPatch.cover_url = input.coverUrl || null;
  if (input.coverPosition !== undefined) coverPatch.cover_position = input.coverPosition || null;
  if (Object.keys(coverPatch).length > 0) {
    const { error } = await supabaseAdmin
      .from('bookings')
      .update(coverPatch)
      .eq('id', input.bookingId)
      .eq('organization_id', orgId);
    if (error) throw new Error('Failed to save the cover.');
    changed.push('cover');
  }

  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/bookings');
  return { ok: true, changed };
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
    .select('id, quantity, title, price, package_id, package:packages(name, price)')
    .eq('id', input.lineId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!line) throw new Error('Line not found');

  const pkg = line.package as any;

  const linePatch: Record<string, unknown> = {};
  if (input.quantity !== undefined) {
    const q = Number(input.quantity);
    if (!Number.isFinite(q) || q <= 0) throw new Error('Quantity must be more than zero.');
    linePatch.quantity = q;
  }

  /*
   * Name and price describe the package this line is for, and that package is
   * this booking's own instance — so renaming or repricing here is a change to
   * the instance, asked of Packages rather than written into its table. A line
   * old enough to have no instance keeps its own columns instead; those
   * bookings predate instancing and there is nothing to ask Packages about.
   */
  let name: string | undefined;
  let price: Record<string, unknown> | undefined;
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error('A line needs a name.');
    name = t;
  }
  if (input.basePrice !== undefined || input.currency !== undefined) {
    const next: any = { ...((pkg?.price ?? line.price) as any) };
    if (input.basePrice !== undefined) next.base_price = input.basePrice;
    if (input.currency !== undefined) next.currency = input.currency;
    price = next;
  }

  if (!line.package_id) {
    if (name !== undefined) linePatch.title = name;
    if (price !== undefined) linePatch.price = price;
  }

  if (Object.keys(linePatch).length > 0) {
    const { error: lineError } = await supabaseAdmin
      .from('booking_lines')
      .update(linePatch)
      .eq('id', input.lineId)
      .eq('organization_id', orgId);
    if (lineError) throw new Error('Failed to update the line');
  }

  if (line.package_id && (name !== undefined || price !== undefined)) {
    const { updatePackage } = await import('@/modules/packages/interface');
    await updatePackage({ packageId: line.package_id, name, price });
  }

  await logEvent({ organizationId: orgId, entityType: 'booking_line', entityId: input.lineId, action: 'updated', actorId: actorId ?? undefined, payload: { ...linePatch, name, price } });
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
    .select('id, title, title_custom, scheduled_for, contact:contacts(display_name), booking_lines(created_at, title, package:packages(name))')
    .eq('id', bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking || booking.title_custom) return { ok: true, title: booking?.title ?? null };

  const lines = ((booking as any).booking_lines || [])
    .slice()
    .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));

  const title = composeTitle({
    clientName: (booking as any).contact?.display_name,
    lineTitles: lines.map((l: any) => l.package?.name || l.title).filter(Boolean),
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
  

  const packageIds = Array.from(new Set((booking?.booking_lines || []).map((l: any) => l.package_id).filter(Boolean))) as string[];
  const questions = (await Promise.all(packageIds.map((id: string) => getIntakeQuestions(id)))).flat();
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
    // The answers are dimension_value UUIDs keyed by dimension id — the studio
    // names both, so the labels come from the studio's own vocabulary rather
    // than from a table of five the engine used to hold.
    const { getPublicIntakeDimensions } = await import('@/modules/services/interface');
    const dimensions = await getPublicIntakeDimensions(orgId);

    for (const [dimensionId, valueId] of Object.entries(answers.dimensions)) {
      if (!valueId) continue;
      const dim = dimensions.find((d) => d.id === dimensionId);
      const opt = dim?.values.find((v) => v.id === valueId);
      if (opt) rows.push({ label: dim!.name, value: opt.name, removed: false });
    }
  }

  return rows;
}

/**
 * What was actually booked under a classification — the dimension graph's first
 * crossing from the catalogue into real work.
 *
 * The chain already exists and holds every hop: a booking line points at a
 * package, a package carries values itself or bundles services that do, and a
 * value rolls up through whatever is nested inside it. So "what did we take on
 * for Birthdays this quarter" is four joins over rows that were already there,
 * and no booking has ever needed a classification of its own.
 *
 * DERIVED LIVE, DELIBERATELY, AND IT IS A REAL TRADE-OFF.
 *
 * A booking line snapshots its price and what varied, because those are what
 * the client agreed to and must never move. Classification is not part of the
 * agreement — it is how the studio thinks about its own work. Renaming Birthday
 * to Celebration should re-read every past booking as Celebration; that is the
 * point of a value being a row rather than a string, and a snapshot would leave
 * half the history speaking a word the studio has abandoned.
 *
 * The cost, stated plainly rather than hidden: RE-TAGGING a package — not
 * renaming, but deciding a Wedding package is now an Engagement package — moves
 * past bookings with it. If that becomes a problem in practice, the fix is a
 * snapshot written at line creation, not a patch here.
 */
export async function listBookingsForDimensionValue(valueId: string) {
  const { orgId } = await getAuthOrgId();

  // Rolled up, so asking about Outdoor finds the beach work — the same rule
  // every other read of this graph follows.
  const { getValuePlace } = await import('@/modules/services/interface');
  const { narrowerIds } = await getValuePlace(valueId);

  // Packages that narrowed a bundled service to it.
  const { data: direct } = await supabaseAdmin
    .from('package_service_dimension_values')
    .select('package_service:package_services(package_id)')
    .eq('organization_id', orgId)
    .in('dimension_value_id', narrowerIds);

  // Packages that bundle a service that says it. The bundle already said so.
  const { data: taggedServices } = await supabaseAdmin
    .from('service_dimension_values')
    .select('service_id')
    .eq('organization_id', orgId)
    .in('dimension_value_id', narrowerIds);

  const serviceIds = [...new Set(((taggedServices || []) as any[]).map((r) => r.service_id))];
  let bundled: any[] = [];
  if (serviceIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('package_services')
      .select('package_id')
      .eq('organization_id', orgId)
      .in('service_id', serviceIds);
    bundled = data || [];
  }

  const packageIds = [...new Set([
    ...((direct || []) as any[]).map((r) => r.package_service?.package_id).filter(Boolean),
    ...bundled.map((r) => r.package_id),
  ])];
  if (packageIds.length === 0) return { bookings: [], total: 0 };

  const { data: lines } = await supabaseAdmin
    .from('booking_lines')
    .select('id, title, price, quantity, package_id, booking:bookings(id, title, title_custom, scheduled_for, contact:contacts(display_name)), package:packages(name)')
    .eq('organization_id', orgId)
    .in('package_id', packageIds);

  // One row per booking, because a booking with two Birthday lines is one
  // birthday job, not two — but the money is the sum of the lines.
  const byBooking = new Map<string, {
    id: string; title: string; scheduledFor: string | null; clientName: string | null;
    packages: string[]; total: number;
  }>();

  for (const l of ((lines || []) as any[])) {
    const b = l.booking;
    if (!b) continue;
    // `price` is the JSONB snapshot of what the package cost when it was sold,
    // read the same way invoices and contracts read it.
    const amount = amountOf(l.price) * Number(l.quantity ?? 1);
    const existing = byBooking.get(b.id);
    if (existing) {
      existing.total += amount;
      if (l.package?.name && !existing.packages.includes(l.package.name)) existing.packages.push(l.package.name);
      continue;
    }
    byBooking.set(b.id, {
      id: b.id,
      title: b.title_custom || b.title || 'Booking',
      scheduledFor: b.scheduled_for ?? null,
      clientName: b.contact?.display_name ?? null,
      packages: l.package?.name ? [l.package.name] : [],
      total: amount,
    });
  }

  const bookings = [...byBooking.values()].sort((a, b) => {
    if (!a.scheduledFor) return 1;
    if (!b.scheduledFor) return -1;
    return b.scheduledFor.localeCompare(a.scheduledFor);
  });

  return { bookings, total: bookings.reduce((sum, b) => sum + b.total, 0) };
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

  // Resolve what they chose against the studio's own vocabulary. Each answer
  // is a value under a dimension the studio named, so both the question and the
  // answer come back as this studio says them.
  const { getPublicIntakeDimensions } = await import('@/modules/services/interface');
  const config = await getPublicIntakeDimensions(orgId);

  const chosen: { dimension: string; value: string; domainName: string | null }[] = [];
  for (const [dimensionId, valueId] of Object.entries(dimensions as Record<string, string>)) {
    if (!valueId) continue;
    const dim = config.find((d) => d.id === dimensionId);
    const value = dim?.values.find((v) => v.id === valueId);
    if (dim && value) chosen.push({ dimension: dim.name, value: value.name, domainName: dim.domainName });
  }
  if (chosen.length === 0) throw new Error('Nothing recognisable was chosen in this request');

  // Named from what they described, in the order the studio asks its questions.
  const serviceName = chosen.map((c) => c.value).join(' ') || 'Custom Service';

  // The domain the answers already point at — a value belongs to one, so the
  // service being extracted belongs there too rather than to a guess.
  const serviceDomain = chosen.find((c) => c.domainName)?.domainName || null;

  // One entry per dimension, values gathered — the same shape the service form
  // sends, so an extracted service is indistinguishable from a defined one.
  const byDimension = new Map<string, string[]>();
  for (const c of chosen) {
    if (!byDimension.has(c.dimension)) byDimension.set(c.dimension, []);
    byDimension.get(c.dimension)!.push(c.value);
  }

  // Create the Service
  const { createService } = await import('@/modules/services/interface');
  const { serviceId } = await createService({
    name: serviceName,
    serviceDomain,
    dimensions: [...byDimension.entries()].map(([name, values]) => ({ name, values })),
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
 * anyone: a Service's Workflow routes each task to a role → a Package
 * inherits the union of its bundled Services' stages → a booking line points
 * at that Package. So the booking already knows it needs a Photographer and a
 * Video Editor; nothing ever said so out loud until work had been started and
 * the roles were buried one-per-task.
 *
 * Surfaced, never acted on — the same discipline as reviewCascadeForCancel.
 * This does not assign anyone, and a role going unfilled is not an error: a
 * studio may well shoot it themselves. Roles are matched by id, not name, and
 * stages the workflow tasks left unrouted are reported rather than hidden, because
 * "the workflow doesn't say who does this" is real information.
 */
export async function getStaffingNeedsForBooking(bookingId: string): Promise<{
  roles: { roleId: string; roleName: string; stageCount: number; fromPackages: string[]; assigned: { employeeId: string; name: string }[] }[];
  unroutedStages: number;
}> { return { roles: [], unroutedStages: 0 }; }

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

/*
 * ─── A BOOKING A CLIENT CAN READ ──────────────────────────────────────────
 *
 * The operator's booking page and the client's are two readings of one row,
 * not one page behind a flag. The studio's is a management surface — what is
 * staffed, what is outstanding, what still has to be done. The client's is an
 * account of their own job.
 *
 * The mechanism is the one already used three times over: a nullable
 * capability token on the row, minted deliberately and destroyed on revoke.
 * Nothing about a booking is readable until somebody decides it should be.
 */

/** Mint the link, or hand back the one already minted. */
export async function shareBooking(input: { bookingId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, share_token, contact_id')
    .eq('id', input.bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking) throw new Error('Booking not found');

  /*
   * SHARING TWICE HANDS BACK THE SAME LINK.
   *
   * Minting a fresh token on every press would silently kill a link the client
   * may already have, and an operator pressing Share again is asking to send
   * it, not to revoke it. Revoking is its own act, with its own button.
   */
  if (booking.share_token) {
    return { shareToken: booking.share_token as string, reused: true };
  }

  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
  const { error } = await supabaseAdmin
    .from('bookings')
    .update({ share_token: token, shared_at: new Date().toISOString() })
    .eq('id', input.bookingId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to share booking:', error);
    throw new Error('The link could not be created.');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking',
    entityId: input.bookingId,
    action: 'shared',
    actorId: actorId ?? undefined,
    payload: {},
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { shareToken: token, reused: false };
}

/** Destroy the link. Anyone holding it gets nothing from then on. */
export async function unshareBooking(input: { bookingId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('bookings')
    .update({ share_token: null, shared_at: null })
    .eq('id', input.bookingId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to revoke booking link:', error);
    throw new Error('The link could not be revoked.');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking',
    entityId: input.bookingId,
    action: 'unshared',
    actorId: actorId ?? undefined,
    payload: {},
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/**
 * The booking as the client's own document, fetched by token alone.
 *
 * No session, no organization to scope by — the token IS the authority, which
 * is the same bargain the gallery and the invoice already strike. So the token
 * is the only thing looked up by, and everything else hangs off the row it
 * finds. There is no id in the URL to swap for somebody else's.
 *
 * It gathers what a confirmation has to state and nothing else. The studio's
 * page is a management surface — what is staffed, what is still to be done,
 * which tasks are unassigned — and none of that is the client's business or
 * their concern. What they need is what was agreed and where it stands.
 */
export async function getBookingByShareToken(token: string) {
  if (!token || token.length < 32) return null;

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select(`
      id, title, brief, scheduled_for, duration_minutes, shared_at, created_at,
      stage:booking_stages(name, kind),
      contact:contacts(display_name, email, phone),
      organization:organizations(id, name, slug, currency, metadata),
      booking_lines(
        id, title, price, quantity, package_id,
        package:packages(
          id, name, description, price,
          package_services(
            id,
            service:services(id, name),
            ${PACKAGE_PROMISE_NAMED},
            package_service_dimension_values(
              dimension_value:dimension_values(id, name, dimension:dimensions(name))
            )
          )
        )
      )
    `)
    .eq('share_token', token)
    .maybeSingle();

  if (!booking) return null;

  /*
   * The money, worked out by the one function that knows how.
   *
   * getBookingBilling counts what was billed, what was forgiven and what has
   * been paid, and a document restating that arithmetic itself would be a
   * second answer waiting to disagree with the studio's own screen. It needs a
   * session, so the figures are read here directly by the same rules.
   */
  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('id, status, currency, discount_amount, tax_amount, share_token, lines:invoice_lines(amount), payments:financial_transactions(kind, amount, status)')
    .eq('booking_id', booking.id);

  let booked = 0;
  let currency: string | null = null;
  for (const l of ((booking as any).booking_lines || [])) {
    const price: any = firstPriced(l.package?.price, l.price);
    booked += amountOf(price) * Number(l.quantity ?? 1);
    if (!currency && price?.currency) currency = price.currency;
  }

  let invoiced = 0;
  let discounted = 0;
  let paid = 0;
  for (const inv of ((invoices || []) as any[])) {
    if (inv.status === 'void') continue;
    const lineSum = (inv.lines || []).reduce((n: number, l: any) => n + Number(l.amount || 0), 0);
    const off = Math.max(0, Math.min(Number(inv.discount_amount || 0), lineSum));
    invoiced += Math.round((lineSum - off) * 100) / 100;
    discounted += off;
    for (const p of (inv.payments || [])) {
      if (p.status === 'settled') {
        paid += p.kind === 'refund' ? -Number(p.amount || 0) : Number(p.amount || 0);
      }
    }
    if (!currency && inv.currency) currency = inv.currency;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    ...(booking as any),
    money: {
      currency: currency || (booking as any).organization?.currency || 'USD',
      agreed: round(booked),
      discounted: round(discounted),
      invoiced: round(invoiced),
      paid: round(paid),
      /** What the client still owes on what has actually been billed. */
      outstanding: round(Math.max(invoiced - paid, 0)),
    },
  };
}
