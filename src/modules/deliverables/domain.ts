'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { revalidatePath } from 'next/cache';

type Facet = { id: string; name: string; position: number };
type NamedTable = 'deliverables';

async function listNamed(table: NamedTable): Promise<Facet[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin.from(table).select('id, name, position').eq('organization_id', orgId).order('position');
  if (error) { console.error(`Failed to list ${table}:`, error); return []; }
  return data || [];
}

async function findOrCreateNamed(table: NamedTable, orgId: string, name: string): Promise<string | null> {
  const clean = (name || '').trim();
  if (!clean) return null;

  const { data: existing } = await supabaseAdmin
    .from(table).select('id')
    .eq('organization_id', orgId).ilike('name', clean).maybeSingle();
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
      const { data: retry } = await supabaseAdmin.from(table).select('id').eq('organization_id', orgId).ilike('name', clean).maybeSingle();
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

export async function findOrCreateOutputType(orgId: string, domainId: string, name: string): Promise<string | null> {
  const clean = (name || '').trim();
  if (!clean || !domainId) return null;

  const { data: existing } = await supabaseAdmin
    .from('deliverables').select('id')
    .eq('organization_id', orgId).eq('service_domain_id', domainId)
    .ilike('name', clean).maybeSingle();
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
      const { data: retry } = await supabaseAdmin.from('deliverables').select('id').eq('organization_id', orgId).eq('service_domain_id', domainId).ilike('name', clean).maybeSingle();
      if (retry) return retry.id as string;
    }
    console.error('Failed to create output type:', error); return null;
  }
  return (created?.id as string) ?? null;
}

export async function listDeliverables(): Promise<(Facet & { serviceDomainId: string; domainName: string | null })[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('deliverables')
    .select('id, name, position, service_domain_id, domain:service_domains(name)')
    .eq('organization_id', orgId)
    .order('position');
  if (error) { console.error('Failed to list output types:', error); return []; }
  return ((data || []) as any[]).map((d) => ({
    id: d.id, name: d.name, position: d.position ?? 0,
    serviceDomainId: d.service_domain_id,
    domainName: d.domain?.name ?? null,
    default_unit: d.default_unit,
    spec_schema: d.spec_schema,
    spec_values: d.spec_values,
  }));
}

export async function getDeliverable(id: string) {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin.from('deliverables').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function listOutputTypesByDomain(): Promise<Record<string, { id: string; name: string }[]>> {
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
  const id = await findOrCreateOutputType(orgId, input.serviceDomainId, input.name);
  if (!id) throw new Error('Give the output type a name.');
  revalidatePath('/services');
  revalidatePath('/deliverables');
  return { outputTypeId: id };
}

export async function renameDeliverable(id: string, name: string) { return renameNamed('deliverables', id, name, 'output type'); }
export async function deleteDeliverable(id: string) { return deleteNamed('deliverables', id, 'output type'); }

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



