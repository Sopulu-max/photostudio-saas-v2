import { supabaseAdmin } from '@/lib/supabase/admin';
import { dbError } from '@/kernel/errors';
import { type MemberAnswer } from './familyShape';

/**
 * Family helpers that take the studio as a parameter.
 *
 * NOT a 'use server' file on purpose: every exported async function in one of
 * those is a callable endpoint, and a helper that accepts an organisation id
 * from its caller must never be one. These are called by the server actions
 * in family.ts and familyMoves.ts, and by the readers in domain.ts.
 */

/** The package whose bundle rows hold this package's structure: the family's for a member, its own otherwise. */
export async function structureIdOf(orgId: string, packageId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('packages').select('member_of')
    .eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  return (data?.member_of as string | null) ?? packageId;
}

export async function memberAnswersOf(orgId: string, memberIds: string[]): Promise<Record<string, MemberAnswer[]>> {
  const out: Record<string, MemberAnswer[]> = {};
  if (memberIds.length === 0) return out;
  const { data } = await supabaseAdmin
    .from('package_member_answers')
    .select('member_id, package_service_id, kind, ref_id, value, answered_by')
    .eq('organization_id', orgId)
    .in('member_id', memberIds);
  for (const r of ((data || []) as any[])) {
    (out[r.member_id] ||= []).push({
      package_service_id: r.package_service_id, kind: r.kind, ref_id: r.ref_id,
      value: r.value, answered_by: r.answered_by,
    });
  }
  return out;
}

type Row = {
  id: string; service_id: string; decided_by: string;
  service: { id: string; name: string } | null;
  package_deliverables: { deliverable_id: string; quantity: number | null; decided_by: string; deliverable: { id: string; name: string } | null }[];
  package_variable_values: { variable_id: string; value: unknown; answered_by: string; variable: { id: string; label: string; kind: string; unit: string | null } | null }[];
  package_service_dimension_values: { dimension_value_id: string }[];
};

export async function rowsOf(orgId: string, packageId: string): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from('package_services')
    .select(`
      id, service_id, decided_by, service:services(id, name),
      package_deliverables(deliverable_id, quantity, decided_by, deliverable:deliverables(id, name)),
      package_variable_values(variable_id, value, answered_by, variable:variables(id, label, kind, unit)),
      package_service_dimension_values(dimension_value_id)
    `)
    .eq('package_id', packageId).eq('organization_id', orgId).order('position');
  if (error) throw new Error(`Could not read the package: ${error.message}`);
  return (data || []) as any[];
}

export const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Leave these things to members on a family, and give every existing member
 * the family's old value as its answer so nothing it sells changes.
 */
export async function widen(orgId: string, familyId: string, what: { kind: 'service' | 'promise' | 'variable'; packageServiceId: string; refId: string | null }[]) {
  if (what.length === 0) return;
  const rows = await rowsOf(orgId, familyId);
  const { data: members } = await supabaseAdmin.from('packages').select('id').eq('organization_id', orgId).eq('member_of', familyId);
  const memberIds = ((members || []) as any[]).map((m) => m.id as string);
  const { data: existing } = memberIds.length
    ? await supabaseAdmin.from('package_member_answers').select('member_id, package_service_id, kind, ref_id').eq('organization_id', orgId).in('member_id', memberIds)
    : { data: [] };
  const has = (memberId: string, w: typeof what[number]) =>
    ((existing || []) as any[]).some((a) => a.member_id === memberId && a.package_service_id === w.packageServiceId && a.kind === w.kind && (a.ref_id ?? null) === (w.refId ?? null));

  const keep: Record<string, unknown>[] = [];
  for (const w of what) {
    const row = rows.find((r) => r.id === w.packageServiceId);
    if (!row) continue;
    if (w.kind === 'service') {
      await supabaseAdmin.from('package_services').update({ decided_by: 'member' }).eq('id', row.id).eq('organization_id', orgId);
      for (const m of memberIds) if (!has(m, w)) keep.push({ organization_id: orgId, member_id: m, package_service_id: row.id, kind: 'service', ref_id: null, value: true, answered_by: 'studio' });
    } else if (w.kind === 'promise') {
      const old = row.package_deliverables.find((p) => p.deliverable_id === w.refId);
      if (old) {
        await supabaseAdmin.from('package_deliverables').update({ decided_by: 'member' }).eq('package_service_id', row.id).eq('deliverable_id', w.refId).eq('organization_id', orgId);
      } else {
        await supabaseAdmin.from('package_deliverables').insert({ organization_id: orgId, package_service_id: row.id, deliverable_id: w.refId, quantity: null, decided_by: 'member' });
      }
      // A promise the family made with no quantity is "included": one each.
      const oldQ = old ? (old.quantity ?? 1) : 0;
      for (const m of memberIds) if (!has(m, w)) keep.push({ organization_id: orgId, member_id: m, package_service_id: row.id, kind: 'promise', ref_id: w.refId, value: oldQ, answered_by: 'studio' });
    } else {
      const old = row.package_variable_values.find((v) => v.variable_id === w.refId);
      if (old) {
        await supabaseAdmin.from('package_variable_values').update({ answered_by: 'member', value: null }).eq('package_service_id', row.id).eq('variable_id', w.refId).eq('organization_id', orgId);
      } else {
        await supabaseAdmin.from('package_variable_values').insert({ organization_id: orgId, package_service_id: row.id, variable_id: w.refId, value: null, answered_by: 'member' });
      }
      if (old && old.answered_by !== 'member') {
        for (const m of memberIds) if (!has(m, w)) keep.push({
          organization_id: orgId, member_id: m, package_service_id: row.id, kind: 'variable', ref_id: w.refId,
          value: old.answered_by === 'client' ? null : old.value, answered_by: old.answered_by === 'client' ? 'client' : 'studio',
        });
      }
    }
  }
  if (keep.length > 0) {
    const { error } = await supabaseAdmin.from('package_member_answers').insert(keep);
    if (error) throw dbError('Could not keep the members whole', error);
  }
}

/**
 * The editor's version of widening: called by updatePackage with the
 * family's rows as they were before the save, so any row that went from
 * fixed to "left to the member" leaves every existing member with its old
 * value as an answer.
 */
export async function keepMembersWhole(orgId: string, familyId: string, before: { rows: Row[] }) {
  const { data: members } = await supabaseAdmin.from('packages').select('id').eq('organization_id', orgId).eq('member_of', familyId);
  const memberIds = ((members || []) as any[]).map((m) => m.id as string);
  if (memberIds.length === 0) return;
  const after = await rowsOf(orgId, familyId);
  const { data: existing } = await supabaseAdmin.from('package_member_answers').select('member_id, package_service_id, kind, ref_id').eq('organization_id', orgId).in('member_id', memberIds);
  const has = (memberId: string, psId: string, kind: string, refId: string | null) =>
    ((existing || []) as any[]).some((a) => a.member_id === memberId && a.package_service_id === psId && a.kind === kind && (a.ref_id ?? null) === refId);
  const keep: Record<string, unknown>[] = [];
  for (const row of after) {
    const was = before.rows.find((r) => r.id === row.id);
    if (!was) continue;
    if (row.decided_by === 'member' && was.decided_by !== 'member') {
      for (const m of memberIds) if (!has(m, row.id, 'service', null)) keep.push({ organization_id: orgId, member_id: m, package_service_id: row.id, kind: 'service', ref_id: null, value: true, answered_by: 'studio' });
    }
    for (const p of row.package_deliverables) {
      if (p.decided_by !== 'member') continue;
      const old = was.package_deliverables.find((x) => x.deliverable_id === p.deliverable_id);
      if (!old || old.decided_by === 'member') continue;
      for (const m of memberIds) if (!has(m, row.id, 'promise', p.deliverable_id)) keep.push({ organization_id: orgId, member_id: m, package_service_id: row.id, kind: 'promise', ref_id: p.deliverable_id, value: old.quantity ?? 1, answered_by: 'studio' });
    }
    for (const v of row.package_variable_values) {
      if (v.answered_by !== 'member') continue;
      const old = was.package_variable_values.find((x) => x.variable_id === v.variable_id);
      if (!old || old.answered_by === 'member') continue;
      for (const m of memberIds) if (!has(m, row.id, 'variable', v.variable_id)) keep.push({
        organization_id: orgId, member_id: m, package_service_id: row.id, kind: 'variable', ref_id: v.variable_id,
        value: old.answered_by === 'client' ? null : old.value, answered_by: old.answered_by === 'client' ? 'client' : 'studio',
      });
    }
  }
  if (keep.length > 0) {
    const { error } = await supabaseAdmin.from('package_member_answers').insert(keep);
    if (error) throw dbError('Could not keep the members whole', error);
  }
}

/** The family's rows before an edit, for keepMembersWhole after it. */
export async function snapshotFamilyRows(orgId: string, familyId: string) {
  return { rows: await rowsOf(orgId, familyId) };
}

