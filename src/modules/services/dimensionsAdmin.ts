'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertOurs } from '@/kernel/tenancy';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { revalidatePath } from 'next/cache';
// Exact-match naming, so "Occasion" typed again finds the studio's Occasion
// rather than making a second one beside it.
import { findByName } from '@/kernel/naming';

/**
 * A studio defining how it classifies its own work.
 *
 * These read and write `dimensions` / `dimension_values` — the model where a
 * domain owns its own vocabulary. Everything below a domain belongs to it, so
 * every call here takes a domain: adding Style to Photography leaves Printing
 * untouched, which is the whole point of scoping them that way.
 *
 * The five that ship (Subject, Occasion, Context, Purpose, Client) are ordinary
 * rows here, seeded per domain. The engine supplies them; it doesn't own them,
 * so they rename, deactivate and delete exactly like one a studio invents.
 */

export type StudioDimension = {
  id: string;
  name: string;
  question: string | null;
  example: string | null;
  isActive: boolean;
  position: number;
  values: { id: string; name: string; position: number; parentId: string | null }[];
};

/**
 * Every dimension this domain classifies by, with its values.
 *
 * Asked through the join now, because a dimension belongs to the STUDIO and a
 * domain declares which ones it asks. It used to belong to the domain, which
 * meant a studio doing photography and videography held two Occasions with two
 * Birthdays in them — the same fact typed twice and maintained once.
 */
export async function listDimensionsForDomain(serviceDomainId: string): Promise<StudioDimension[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('service_domain_dimensions')
    .select('position, dimension:dimensions(id, name, question, example, is_active, position, dimension_values(id, name, position, parent_id))')
    .eq('organization_id', orgId)
    .eq('service_domain_id', serviceDomainId)
    .order('position');
  if (error) {
    console.error('Failed to list dimensions:', error);
    return [];
  }
  return ((data || []) as any[]).map((row) => row.dimension).filter(Boolean).map((d: any) => ({
    id: d.id,
    name: d.name,
    question: d.question,
    example: d.example,
    isActive: d.is_active,
    position: d.position ?? 0,
    values: (d.dimension_values || [])
      .map((v: any) => ({ id: v.id, name: v.name, position: v.position ?? 0, parentId: v.parent_id ?? null }))
      .sort((a: any, b: any) => a.position - b.position || a.name.localeCompare(b.name)),
  }));
}

/**
 * A new way for this domain to classify its work — Style, Season, Turnaround.
 *
 * The question matters more than it looks: a dimension is a question the studio
 * asks about its own services, and one without it is a column header nobody can
 * interpret six months later.
 */
export async function createDimension(input: {
  serviceDomainId: string;
  name: string;
  question?: string | null;
  example?: string | null;
}) {
  const { orgId } = await getAuthOrgId();
  await assertOurs(orgId, [{ table: 'service_domains', id: input.serviceDomainId, label: 'service domain' }]);
  const name = (input.name || '').trim();
  if (!name) throw new Error('Give the dimension a name.');

  /*
   * FOUND BEFORE CREATED. The studio asks a question once; a domain that starts
   * asking a question another domain already asks links to the same one rather
   * than making a second with the same name. That second copy is precisely what
   * this studio had: two Occasions, one per domain, each with its own Birthday.
   */
  const { data: known } = await supabaseAdmin
    .from('dimensions')
    .select('id, name')
    .eq('organization_id', orgId);
  const existing = findByName(known, name);

  let dimensionId = existing?.id as string | undefined;
  if (!dimensionId) {
    const { data, error } = await supabaseAdmin
      .from('dimensions')
      .insert({
        organization_id: orgId,
        name,
        question: (input.question || '').trim() || null,
        example: (input.example || '').trim() || null,
        position: 0,
      })
      .select('id')
      .single();
    if (error || !data) {
      console.error('Failed to create dimension:', error);
      throw new Error('Failed to add that dimension');
    }
    dimensionId = data.id as string;
  }

  const { data: last } = await supabaseAdmin
    .from('service_domain_dimensions')
    .select('position')
    .eq('organization_id', orgId)
    .eq('service_domain_id', input.serviceDomainId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from('service_domain_dimensions')
    .insert({
      organization_id: orgId,
      service_domain_id: input.serviceDomainId,
      dimension_id: dimensionId,
      position: ((last?.position as number) ?? -1) + 1,
    });

  if (error) {
    if ((error as any).code === '23505') throw new Error(`This domain already classifies by ${name}.`);
    console.error('Failed to attach dimension to domain:', error);
    throw new Error('Failed to add that dimension');
  }

  revalidatePath('/services/settings');
  revalidatePath('/services');
  return { dimensionId };
}

export async function renameDimension(input: { dimensionId: string; name?: string; question?: string | null; example?: string | null }) {
  const { orgId } = await getAuthOrgId();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error('A dimension needs a name.');
    patch.name = n;
  }
  if (input.question !== undefined) patch.question = (input.question || '').trim() || null;
  if (input.example !== undefined) patch.example = (input.example || '').trim() || null;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabaseAdmin
    .from('dimensions').update(patch)
    .eq('id', input.dimensionId).eq('organization_id', orgId);
  if (error) throw new Error('Failed to save that dimension');
  revalidatePath('/services/settings');
  return { ok: true };
}

/**
 * Stop classifying by this, without forgetting what was already classified.
 * Turning Occasion off shouldn't lose which services were weddings.
 */
export async function setDimensionActive(input: { dimensionId: string; isActive: boolean }) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('dimensions').update({ is_active: input.isActive })
    .eq('id', input.dimensionId).eq('organization_id', orgId);
  if (error) throw new Error('Failed to change that dimension');
  revalidatePath('/services/settings');
  revalidatePath('/services');
  return { ok: true };
}

/** Delete it and everything filed under it. Deactivating is nearly always what a studio means. */
/**
 * This domain stops asking this question.
 *
 * WHY IT IS NOT A DELETE ANY MORE. A dimension used to belong to one domain, so
 * removing it was contained: nothing else could be looking at it. Now the studio
 * owns the question and several domains may ask it, and deleting the row from
 * Photography's settings would take it out of Videography's as well — along
 * with every value under it, and therefore every classification on every
 * service and package that used one. A destructive action that used to affect
 * one screen would silently reach across the studio.
 *
 * So this unlinks. The question itself goes only when no domain asks it any
 * more AND nothing is filed under it — at which point removing it is tidying up
 * rather than throwing anything away.
 */
export async function deleteDimension(dimensionId: string, serviceDomainId?: string) {
  const { orgId } = await getAuthOrgId();

  if (serviceDomainId) {
    const { error } = await supabaseAdmin
      .from('service_domain_dimensions').delete()
      .eq('organization_id', orgId)
      .eq('service_domain_id', serviceDomainId)
      .eq('dimension_id', dimensionId);
    if (error) { console.error('Failed to unlink dimension:', error); throw new Error('Failed to remove that dimension'); }
  }

  // Still asked somewhere? Then it stays, whole.
  const { count: stillAsked } = await supabaseAdmin
    .from('service_domain_dimensions')
    .select('dimension_id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('dimension_id', dimensionId);
  if ((stillAsked ?? 0) > 0) {
    revalidatePath('/services/settings');
    revalidatePath('/services');
    return { ok: true, removed: false };
  }

  /*
   * Nobody asks it. It still does not go if anything is filed under it — a
   * service or a package classified by one of its values would lose that
   * classification without anyone having said so.
   */
  const { data: values } = await supabaseAdmin
    .from('dimension_values').select('id')
    .eq('organization_id', orgId).eq('dimension_id', dimensionId);
  const valueIds = ((values || []) as any[]).map((v) => v.id);

  if (valueIds.length > 0) {
    const [{ count: onServices }, { count: onPackages }] = await Promise.all([
      supabaseAdmin.from('service_dimension_values')
        .select('dimension_value_id', { count: 'exact', head: true }).in('dimension_value_id', valueIds),
      supabaseAdmin.from('package_service_dimension_values')
        .select('dimension_value_id', { count: 'exact', head: true }).in('dimension_value_id', valueIds),
    ]);
    if ((onServices ?? 0) > 0 || (onPackages ?? 0) > 0) {
      revalidatePath('/services/settings');
      revalidatePath('/services');
      return { ok: true, removed: false };
    }
  }

  const { error } = await supabaseAdmin
    .from('dimensions').delete()
    .eq('id', dimensionId).eq('organization_id', orgId);
  if (error) throw new Error('Failed to remove that dimension');
  revalidatePath('/services/settings');
  revalidatePath('/services');
  return { ok: true, removed: true };
}

/** A value under a dimension — Outdoor under Context, Editorial under Purpose. */
export async function addDimensionValue(input: { dimensionId: string; name: string }) {
  const { orgId } = await getAuthOrgId();
  await assertOurs(orgId, [{ table: 'dimensions', id: input.dimensionId, label: 'classification' }]);
  const name = (input.name || '').trim();
  if (!name) throw new Error('Give the value a name.');

  const { data: last } = await supabaseAdmin
    .from('dimension_values')
    .select('position').eq('dimension_id', input.dimensionId)
    .order('position', { ascending: false }).limit(1).maybeSingle();

  const { error } = await supabaseAdmin.from('dimension_values').insert({
    organization_id: orgId,
    dimension_id: input.dimensionId,
    name,
    position: ((last?.position as number) ?? -1) + 1,
  });
  if (error) {
    if ((error as any).code === '23505') throw new Error(`${name} is already there.`);
    console.error('Failed to add dimension value:', error);
    throw new Error('Failed to add that value');
  }
  revalidatePath('/services/settings');
  revalidatePath('/services');
  return { ok: true };
}

/**
 * Beach is an Outdoor.
 *
 * Nesting is not decoration: it changes an answer. Asking what this studio does
 * Outdoors includes its beach shoots afterwards, because the lens rolls a value
 * up through its children — see whatCarries(). Storage stays exact (a beach
 * shoot is tagged Beach and nothing else); the rollup happens at read time, so
 * re-parenting later corrects every answer at once instead of leaving a trail
 * of duplicated tags to clean up.
 *
 * Guarded three ways, because the shape is a tree and all three would break it:
 * a value cannot be its own parent, cannot be nested under a value from a
 * different dimension (Outdoor is not a kind of Wedding), and cannot be nested
 * under its own descendant.
 */
export async function setValueParent(input: { valueId: string; parentId: string | null }) {
  const { orgId } = await getAuthOrgId();

  if (input.parentId === input.valueId) throw new Error('A value can’t be inside itself.');

  const { data: value } = await supabaseAdmin
    .from('dimension_values').select('id, name, dimension_id')
    .eq('id', input.valueId).eq('organization_id', orgId).maybeSingle();
  if (!value) throw new Error('That value no longer exists.');

  if (input.parentId) {
    const { data: parent } = await supabaseAdmin
      .from('dimension_values').select('id, name, dimension_id')
      .eq('id', input.parentId).eq('organization_id', orgId).maybeSingle();
    if (!parent) throw new Error('That parent no longer exists.');
    if (parent.dimension_id !== value.dimension_id) {
      throw new Error('A value can only sit inside another answer to the same question.');
    }

    // Walk up from the proposed parent: meeting ourselves means a cycle.
    const { data: siblings } = await supabaseAdmin
      .from('dimension_values').select('id, parent_id')
      .eq('organization_id', orgId).eq('dimension_id', value.dimension_id);
    const parentOf = new Map(((siblings || []) as any[]).map((r) => [r.id, r.parent_id]));
    let cursor: string | null | undefined = input.parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === input.valueId) throw new Error(`${parent.name} is already inside ${value.name}.`);
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  const { error } = await supabaseAdmin
    .from('dimension_values').update({ parent_id: input.parentId })
    .eq('id', input.valueId).eq('organization_id', orgId);
  if (error) { console.error('Failed to nest value:', error); throw new Error('Failed to move that value'); }

  revalidatePath('/services/settings');
  revalidatePath('/services');
  revalidatePath('/services/classifications');
  return { ok: true };
}

export async function removeDimensionValue(valueId: string) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('dimension_values').delete()
    .eq('id', valueId).eq('organization_id', orgId);
  if (error) throw new Error('Failed to remove that value');
  revalidatePath('/services/settings');
  revalidatePath('/services');
  return { ok: true };
}
