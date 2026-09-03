'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { revalidatePath } from 'next/cache';
import { findByName } from '@/kernel/naming';

type Facet = { id: string; name: string; position: number };

/*
 * Two kinds of vocabulary, one set of mechanics.
 *
 * A deliverable is a KIND of thing produced; a delivery container is what
 * carries it — a gallery, a Drive folder, a USB stick. The ontology is explicit
 * that containers "transport outputs without transforming them", which is why
 * they sit beside deliverables rather than under them: neither is a service,
 * and both are just names the studio keeps.
 */
type NamedTable = 'deliverables' | 'delivery_containers';

/**
 * What listDeliverables actually returns.
 *
 * Its signature said `Facet & { serviceDomainId, domainName }` while the body
 * also returned default_unit, spec_schema and spec_values. The mapped source is
 * typed `any[]`, so TypeScript could not see the difference and never
 * complained — the three fields arrived at runtime and were invisible to every
 * caller through the type. A signature that under-reports is worse than one
 * that is merely wrong: it makes working fields look like missing ones.
 */
export type Deliverable = Facet & {
  serviceDomainId: string;
  domainName: string | null;
  /** The unit a package usually specifies this in — "photograph", "minute". */
  default_unit: string | null;
  /** What spec fields this kind HAS. Declared here, answered on a package. */
  spec_schema: Record<string, unknown> | null;
  /** Defaults for those fields, which a package may override. */
  spec_values: Record<string, unknown> | null;
};

async function listNamed(table: NamedTable): Promise<Facet[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin.from(table).select('id, name, position').eq('organization_id', orgId).order('position');
  if (error) { console.error(`Failed to list ${table}:`, error); return []; }
  return data || [];
}

async function findOrCreateNamed(table: NamedTable, orgId: string, name: string): Promise<string | null> {
  const clean = (name || '').trim();
  if (!clean) return null;

  // Case-insensitive EQUALITY, not a pattern match — see kernel/naming.
  const { data: candidates } = await supabaseAdmin
    .from(table).select('id, name')
    .eq('organization_id', orgId);
  const existing = findByName(candidates, clean);
  if (existing) return existing.id as string;

  const { data: last } = await supabaseAdmin
    .from(table).select('position')
    .eq('organization_id', orgId)
    .order('position', { ascending: false }).limit(1).maybeSingle();

  const { data: created, error } = await supabaseAdmin
    .from(table)
    .insert({ organization_id: orgId, name: clean, position: ((last?.position as number) ?? -1) + 1 } as any)
    .select('id').maybeSingle();
  if (error) {
    if (error.code === '23505') {
      const { data: retryRows } = await supabaseAdmin.from(table).select('id, name').eq('organization_id', orgId);
      const retry = findByName(retryRows, clean);
      if (retry) return retry.id as string;
    }
    console.error(`Failed to create ${table}:`, error); return null;
  }
  return (created?.id as string) ?? null;
}

async function renameNamed(table: NamedTable, id: string, name: string, label: string) {
  const { orgId } = await getAuthOrgId();
  const clean = (name || '').trim();
  if (!clean) throw new Error(`Give the ${label} a name.`);
  const { error } = await supabaseAdmin.from(table).update({ name: clean }).eq('id', id).eq('organization_id', orgId);
  if (error) throw new Error(`Failed to rename (does that ${label} already exist?)`);
  revalidatePath('/services');
  revalidatePath('/packages');
  revalidatePath('/deliverables');
  return { ok: true };
}

async function deleteNamed(table: NamedTable, id: string, label: string) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin.from(table).delete().eq('id', id).eq('organization_id', orgId);
  if (error) throw new Error(`Failed to remove the ${label}`);
  revalidatePath('/services');
  revalidatePath('/packages');
  revalidatePath('/deliverables');
  return { ok: true };
}

export async function findOrCreateDeliverableNamed(orgId: string, domainId: string, name: string): Promise<string | null> {
  const clean = (name || '').trim();
  if (!clean || !domainId) return null;

  const { data: candidates } = await supabaseAdmin
    .from('deliverables').select('id, name')
    .eq('organization_id', orgId).eq('service_domain_id', domainId);
  const existing = findByName(candidates, clean);
  if (existing) return existing.id as string;

  const { data: last } = await supabaseAdmin
    .from('deliverables').select('position')
    .eq('organization_id', orgId).eq('service_domain_id', domainId)
    .order('position', { ascending: false }).limit(1).maybeSingle();

  const { data: created, error } = await supabaseAdmin
    .from('deliverables')
    .insert({ organization_id: orgId, service_domain_id: domainId, name: clean, position: ((last?.position as number) ?? -1) + 1 })
    .select('id').maybeSingle();
  if (error) {
    if (error.code === '23505') {
      const { data: retryRows2 } = await supabaseAdmin.from('deliverables').select('id, name').eq('organization_id', orgId).eq('service_domain_id', domainId);
      const retry = findByName(retryRows2, clean);
      if (retry) return retry.id as string;
    }
    console.error('Failed to create deliverable:', error); return null;
  }
  return (created?.id as string) ?? null;
}

export async function listDeliverables(): Promise<Deliverable[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('deliverables')
    /* The three spec columns were being returned by the mapper without being
       selected, so they arrived undefined on every row. The type now promises
       them, so the query has to ask for them. */
    .select('id, name, position, service_domain_id, default_unit, spec_schema, spec_values, domain:service_domains(name)')
    .eq('organization_id', orgId)
    .order('position');
  if (error) { console.error('Failed to list deliverables:', error); return []; }
  return ((data || []) as any[]).map((d) => ({
    id: d.id, name: d.name, position: d.position ?? 0,
    serviceDomainId: d.service_domain_id,
    domainName: d.domain?.name ?? null,
    default_unit: d.default_unit ?? null,
    spec_schema: d.spec_schema ?? null,
    spec_values: d.spec_values ?? null,
  }));
}

export async function getDeliverable(id: string) {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin.from('deliverables').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function listDeliverablesByDomain(): Promise<Record<string, { id: string; name: string }[]>> {
  const all = await listDeliverables();
  const out: Record<string, { id: string; name: string }[]> = {};
  for (const d of all) {
    if (!d.domainName) continue;
    (out[d.domainName] ||= []).push({ id: d.id, name: d.name });
  }
  return out;
}

export async function createDeliverable(input: { serviceDomainId: string; name: string }) {
  const { orgId } = await getAuthOrgId();
  const id = await findOrCreateDeliverableNamed(orgId, input.serviceDomainId, input.name);
  if (!id) throw new Error('Give the deliverable a name.');
  revalidatePath('/services');
  revalidatePath('/deliverables');
  return { outputTypeId: id };
}

export async function renameDeliverable(id: string, name: string) { return renameNamed('deliverables', id, name, 'deliverable'); }
export async function deleteDeliverable(id: string) { return deleteNamed('deliverables', id, 'deliverable'); }

export async function updateDeliverableConfig(id: string, input: {
  default_unit?: string | null;
  spec_schema?: Record<string, unknown> | null;
  spec_values?: Record<string, unknown> | null;
}) {
  const { orgId } = await getAuthOrgId();
  const patch: Record<string, unknown> = {};
  if (input.default_unit !== undefined) patch.default_unit = input.default_unit;
  if (input.spec_schema !== undefined) patch.spec_schema = input.spec_schema;
  if (input.spec_values !== undefined) patch.spec_values = input.spec_values;

  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin.from('deliverables').update(patch).eq('id', id).eq('organization_id', orgId);
    if (error) throw new Error('Failed to update deliverable configuration');
    revalidatePath('/deliverables');
    revalidatePath('/packages');
    revalidatePath('/services');
  }
  return { ok: true };
}




/*
 * ─── DELIVERY CONTAINERS ───────────────────────────────────────────────────
 *
 * What carries the work to a client: a gallery, a Drive folder, a USB stick, a
 * QR code. The ontology is explicit that they "transport outputs without
 * transforming them" and that they are never services — which is exactly why
 * they live beside deliverables rather than under them.
 *
 * THE TABLE HAS BEEN THERE ALL ALONG, AND SO HAS A ROW IN IT. What was missing
 * was any way to see or add one: delivery_containers appeared in a single type
 * union and nowhere else, and the section on the Deliverables page that
 * promised them read `const containers: any[] = []` with a map over another
 * empty literal. It could not have rendered a container if one existed, and one
 * did.
 */

/** Every vessel this studio delivers through. */
export async function listDeliveryContainers(): Promise<Facet[]> {
  return listNamed('delivery_containers');
}

export async function createDeliveryContainer(name: string) {
  const { orgId } = await getAuthOrgId();
  const id = await findOrCreateNamed('delivery_containers', orgId, name);
  if (!id) throw new Error('Give the container a name.');
  revalidatePath('/deliverables');
  return { containerId: id };
}

export async function renameDeliveryContainer(id: string, name: string) {
  return renameNamed('delivery_containers', id, name, 'container');
}

export async function deleteDeliveryContainer(id: string) {
  return deleteNamed('delivery_containers', id, 'container');
}

/*
 * ─── WHAT A SERVICE CAN PRODUCE ────────────────────────────────────────────
 *
 * THE MODULE OWNS THE EDGE, NOT JUST THE NOUN.
 *
 * A deliverable is a CLASS — "edited photograph" — and the app points at it
 * from four altitudes:
 *
 *   deliverables            the class            what this studio can produce
 *   service_deliverables    the capability       this service produces that
 *   package_deliverables    the promise          "× 20", with a spec
 *   assets                  the instance         the actual file
 *
 * Until now this module owned only the first row of that table. Services wrote
 * `service_deliverables` itself, in five places — on create, on update, and on
 * duplicate — reaching past the module that defines the thing to write the
 * relationship to it. The module was a CRUD wrapper on a name list, and the
 * behaviour that makes a deliverable mean anything lived somewhere else.
 *
 * So the edge moves here. Services still decides WHICH deliverables one of its
 * services offers — that is its business — but it asks for the change rather
 * than performing it, the same way it already asked this module to mint the
 * name. One module, one concept, one place a deliverable is attached to
 * anything.
 *
 * No import runs the other way, so nothing here needs to know what a service
 * is beyond its id: this writes a join table, it does not reach into Services.
 */

/** Which deliverable ids a service currently offers. */
export async function listDeliverableIdsForService(serviceId: string): Promise<string[]> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('service_deliverables')
    .select('deliverable_id')
    .eq('service_id', serviceId)
    .eq('organization_id', orgId);
  return ((data || []) as any[]).map((r) => r.deliverable_id).filter(Boolean);
}

/**
 * Say what a service produces, by name, replacing whatever it said before.
 *
 * Names rather than ids because that is what the service form collects — an
 * operator types "Contact sheet" and this decides whether that is a deliverable
 * the studio already has. Resolved inside the service's own domain, because a
 * deliverable belongs to one and naming one outside it would put Photography's
 * vocabulary on a Printing service.
 *
 * A service with no domain can produce nothing nameable yet, which is not an
 * error — it is a service that has not been told what kind of work it is.
 */
export async function setDeliverablesForService(input: {
  serviceId: string;
  serviceDomainId: string | null;
  names: string[];
}) {
  const { orgId } = await getAuthOrgId();

  await supabaseAdmin
    .from('service_deliverables')
    .delete()
    .eq('service_id', input.serviceId)
    .eq('organization_id', orgId);

  if (!input.serviceDomainId) return { ok: true, attached: 0 };

  const ids: string[] = [];
  for (const name of input.names || []) {
    const id = await findOrCreateDeliverableNamed(orgId, input.serviceDomainId, name);
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return { ok: true, attached: 0 };

  const { error } = await supabaseAdmin
    .from('service_deliverables')
    .insert(ids.map((deliverable_id) => ({
      organization_id: orgId, service_id: input.serviceId, deliverable_id,
    })));
  if (error) {
    console.error('Failed to attach deliverables to the service:', error);
    throw new Error('Could not record what this service produces');
  }
  return { ok: true, attached: ids.length };
}

/**
 * Give a copy of a service everything the original produces.
 *
 * A fork is the same work sold differently, so both sit in one domain and point
 * at one vocabulary — the ids copy across untouched, with no resolving to do.
 */
export async function copyDeliverablesBetweenServices(input: {
  fromServiceId: string;
  toServiceId: string;
}) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('service_deliverables')
    .select('deliverable_id')
    .eq('service_id', input.fromServiceId)
    .eq('organization_id', orgId);

  const rows = ((data || []) as any[])
    .map((d) => d.deliverable_id)
    .filter(Boolean)
    .map((deliverable_id) => ({
      organization_id: orgId, service_id: input.toServiceId, deliverable_id,
    }));
  if (rows.length === 0) return { ok: true, copied: 0 };

  const { error } = await supabaseAdmin.from('service_deliverables').insert(rows);
  if (error) {
    console.error('Failed to copy deliverables to the new service:', error);
    throw new Error('Could not copy what the service produces');
  }
  return { ok: true, copied: rows.length };
}

/**
 * Attach one deliverable to a service, creating it if the studio has not named
 * it before, and answer with what the studio actually calls it.
 *
 * The stored name rather than the typed one: find-or-create matches an existing
 * deliverable however it was capitalised, so a caller showing the typed string
 * would show "contact sheet" next to a studio that calls it "Contact Sheet".
 *
 * Idempotent. Declaring the same output twice is an operator pressing a button
 * twice, not a request for two rows — and there is no unique constraint on the
 * pair to catch it.
 */
export async function attachDeliverableToService(input: {
  serviceId: string;
  serviceDomainId: string;
  name: string;
}): Promise<{ id: string; name: string }> {
  const { orgId } = await getAuthOrgId();
  const asked = (input.name || '').trim();
  if (!asked) throw new Error('Give the deliverable a name.');

  const deliverableId = await findOrCreateDeliverableNamed(orgId, input.serviceDomainId, asked);
  if (!deliverableId) throw new Error(`Failed to add "${asked}"`);

  const { data: already } = await supabaseAdmin
    .from('service_deliverables').select('id')
    .eq('organization_id', orgId)
    .eq('service_id', input.serviceId)
    .eq('deliverable_id', deliverableId)
    .maybeSingle();

  if (!already) {
    const { error } = await supabaseAdmin.from('service_deliverables')
      .insert({ organization_id: orgId, service_id: input.serviceId, deliverable_id: deliverableId });
    if (error) {
      console.error('Failed to attach a deliverable to a service:', error);
      throw new Error(`Failed to add "${asked}"`);
    }
  }

  const { data: stored } = await supabaseAdmin
    .from('deliverables').select('id, name').eq('id', deliverableId).maybeSingle();
  return { id: deliverableId, name: (stored?.name as string) ?? asked };
}

/** Every deliverable these services between them can produce. */
export async function listDeliverableIdsForServices(serviceIds: string[]): Promise<string[]> {
  if (serviceIds.length === 0) return [];
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('service_deliverables').select('deliverable_id')
    .in('service_id', serviceIds)
    .eq('organization_id', orgId);
  return Array.from(new Set(((data || []) as any[]).map((d) => d.deliverable_id))) as string[];
}

/*
 * ─── WHAT A PACKAGE PROMISES, AND WHAT A DELIVERY FULFILS ──────────────────
 *
 * The remaining two edges. Packages still decides WHAT it promises and in what
 * quantity — that is the commercial layer's whole job — and Delivery still
 * decides which promises a bundle of files closes out. Neither writes the link
 * any more, for the reason the service edge moved: a link to a deliverable is
 * this module's to write, and an edge written from three places drifts.
 *
 * IT HAD ALREADY DRIFTED. Saving a package wrote deliverable_id, quantity AND
 * spec_values; copying one — which is what duplicating a package does, and what
 * instancing one for a booking does — selected only deliverable_id and quantity
 * and inserted only those. So "Framed print · 20x30" came out of a duplicate as
 * "Framed print", and the client's own instance of a package lost the
 * specification it was sold with. Invisible until now only because nothing
 * could set a spec in the first place.
 *
 * One writer, one column list, and that class of fault has nowhere left to
 * live.
 */

/** Every column a package's promise carries. The one definition of that shape. */
const PACKAGE_DELIVERABLE_COLUMNS = 'package_service_id, deliverable_id, quantity, spec_values';

/** What these bundle rows promise. */
export async function listPackageDeliverableLinks(packageServiceIds: string[]) {
  if (packageServiceIds.length === 0) return [];
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('package_deliverables')
    .select(PACKAGE_DELIVERABLE_COLUMNS)
    .eq('organization_id', orgId)
    .in('package_service_id', packageServiceIds);
  return (data || []) as any[];
}

/**
 * Replace what a package promises, across every bundle row it has.
 *
 * Scoped by bundle row rather than by package, because a promise hangs off the
 * row joining a package to a service — there is no package-wide handle on these.
 */
export async function setPackageDeliverables(input: {
  packageServiceIds: string[];
  links: Record<string, unknown>[];
}) {
  const { orgId } = await getAuthOrgId();
  if (input.packageServiceIds.length === 0) return { ok: true };

  const { error: clearError } = await supabaseAdmin
    .from('package_deliverables').delete()
    .eq('organization_id', orgId)
    .in('package_service_id', input.packageServiceIds);
  if (clearError) {
    console.error('Failed to clear what this package promises:', clearError);
    throw new Error('Failed to save what this package promises');
  }

  if (input.links.length === 0) return { ok: true };
  const { error } = await supabaseAdmin.from('package_deliverables').insert(input.links);
  if (error) {
    console.error('Failed to save what this package promises:', error);
    throw new Error('Failed to save what this package promises');
  }
  return { ok: true };
}

/**
 * Carry a package's promises onto a copy of it, whole.
 *
 * `rowMap` is old bundle-row id → new one. A plain object rather than the
 * function the caller used to pass, so nothing here depends on being called
 * from the same process.
 *
 * Every column travels. That is the entire point: the previous copier listed
 * its columns by hand and forgot spec_values.
 */
export async function copyPackageDeliverables(input: {
  fromPackageServiceIds: string[];
  rowMap: Record<string, string>;
}) {
  const { orgId } = await getAuthOrgId();
  const source = await listPackageDeliverableLinks(input.fromPackageServiceIds);

  const links = source
    .map((r) => ({ r, to: input.rowMap[r.package_service_id] }))
    .filter((x) => Boolean(x.to))
    .map(({ r, to }) => ({
      organization_id: orgId,
      package_service_id: to,
      deliverable_id: r.deliverable_id,
      quantity: r.quantity,
      spec_values: r.spec_values,
    }));
  if (links.length === 0) return { ok: true, copied: 0 };

  const { error } = await supabaseAdmin.from('package_deliverables').insert(links);
  if (error) {
    console.error('Failed to copy what the package promises:', error);
    throw new Error('Failed to copy the package');
  }
  return { ok: true, copied: links.length };
}

/** Which promises this delivery closes out. */
export async function listDeliveryDeliverableIds(deliveryId: string): Promise<string[]> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('delivery_deliverables')
    .select('deliverable_id')
    .eq('organization_id', orgId)
    .eq('delivery_id', deliveryId);
  return ((data || []) as any[]).map((r) => r.deliverable_id).filter(Boolean);
}

/** Say which promises a delivery fulfils, replacing whatever it said before. */
export async function setDeliveryDeliverables(input: {
  deliveryId: string;
  deliverableIds: string[];
}) {
  const { orgId } = await getAuthOrgId();

  await supabaseAdmin
    .from('delivery_deliverables').delete()
    .eq('organization_id', orgId)
    .eq('delivery_id', input.deliveryId);

  if (input.deliverableIds.length === 0) return { ok: true };
  const { error } = await supabaseAdmin.from('delivery_deliverables').insert(
    input.deliverableIds.map((deliverable_id) => ({
      organization_id: orgId, delivery_id: input.deliveryId, deliverable_id,
    })),
  );
  if (error) {
    console.error('Failed to set what this delivery fulfils:', error);
    throw new Error('Failed to save what this delivery covers');
  }
  return { ok: true };
}

/** Which deliverables a booking's deliveries have covered between them. */
export async function listDeliveredDeliverableIdsForBooking(bookingId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('delivery_deliverables')
    .select('deliverable_id, delivery:deliveries!inner(id, title, status, booking_id)')
    .eq('organization_id', orgId)
    .eq('delivery.booking_id', bookingId);
  return (data || []) as any[];
}

/*
 * ─── WHAT A DELIVERABLE NEEDS SETTLING ─────────────────────────────────────
 *
 * "Edited photograph" needs nothing. "Framed print" has a size and a frame, and
 * every package promising one has to settle both — a fact about the KIND, not
 * about any package that sells it.
 *
 * THIS IS THE THIRD OWNER OF A VARIABLE, NOT A THIRD MECHANISM. A variable
 * already has a kind, a unit, options, bounds and a default; a package already
 * decides whether it fixes one or leaves it for the client; a booking line
 * already holds the answer. The dimension migration made exactly this argument
 * when a classification became the second owner, and named the alternative "the
 * duplication this codebase keeps paying for".
 *
 * I built that duplication anyway — a jsonb `spec_schema` carrying a shape
 * invented for it, with three field types against the eight the real one
 * checks, no unit, no bounds, no default, and no share of parseVariableValue.
 * It was a second variable system that only deliverables could use and only
 * this module could read. This is the correction: a deliverable declares a
 * variable, like a service and a classification do.
 *
 * The answer table needs nothing. package_variable_values keys on
 * (package_service_id, variable_id), and two deliverables that each declare a
 * "size" declare two different variables — so a package can answer both, on one
 * bundle row, with no schema change at all.
 */

/** What these deliverables declare. */
export async function listVariablesForDeliverables(deliverableIds: string[]) {
  if (deliverableIds.length === 0) return [];
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('variables')
    .select('*')
    .eq('organization_id', orgId)
    .in('deliverable_id', deliverableIds)
    .order('position');
  if (error) {
    console.error('Failed to list what these deliverables need settling:', error);
    return [];
  }
  return (data || []) as any[];
}

/**
 * Declare something a deliverable needs settling.
 *
 * Idempotent on the key: asking twice for "size" finds the one that exists
 * rather than making a second the unique index would refuse anyway.
 */
export async function declareDeliverableVariable(input: {
  deliverableId: string;
  variable: {
    key?: string;
    label: string;
    kind?: string;
    unit?: string | null;
    options?: string[];
    defaultValue?: unknown;
    min?: number | null;
    max?: number | null;
  };
}) {
  const { orgId } = await getAuthOrgId();

  // Scoped read, so this doubles as the ownership check: a deliverable that is
  // not this studio's comes back empty.
  const { data: deliverable } = await supabaseAdmin
    .from('deliverables').select('id')
    .eq('id', input.deliverableId).eq('organization_id', orgId).maybeSingle();
  if (!deliverable) throw new Error('That deliverable was not found.');

  const key = (input.variable.key || input.variable.label || '')
    .trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
  const label = (input.variable.label || '').trim();
  if (!key || !label) throw new Error('That needs a name.');

  const existing = await listVariablesForDeliverables([input.deliverableId]);
  const already = existing.find((v) => v.key === key);
  if (already) return already;

  const { data, error } = await supabaseAdmin
    .from('variables')
    .insert({
      organization_id: orgId,
      // The owner, and the only thing that makes this different from a
      // service's or a classification's. The check constraint refuses two.
      deliverable_id: input.deliverableId,
      service_id: null,
      dimension_id: null,
      key,
      label,
      kind: input.variable.kind || 'text',
      unit: (input.variable.unit || '').trim() || null,
      options: input.variable.options || [],
      default_value: input.variable.defaultValue ?? null,
      min_value: input.variable.min ?? null,
      max_value: input.variable.max ?? null,
      position: existing.length,
    })
    .select('*')
    .single();
  if (error || !data) {
    console.error('Failed to declare what a deliverable needs:', error);
    throw new Error('Could not add that');
  }

  revalidatePath('/deliverables');
  revalidatePath('/packages');
  return data as any;
}

export async function removeDeliverableVariable(variableId: string) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('variables').delete()
    .eq('id', variableId).eq('organization_id', orgId)
    // Never a service's or a classification's, however the id arrived.
    .not('deliverable_id', 'is', null);
  if (error) {
    console.error('Failed to remove a deliverable variable:', error);
    throw new Error('Failed to remove that');
  }
  revalidatePath('/deliverables');
  revalidatePath('/packages');
  return { ok: true };
}
