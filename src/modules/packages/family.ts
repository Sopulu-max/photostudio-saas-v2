'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudioCurrency } from '@/kernel/organizations';
import { logEvent } from '@/kernel/events';
import { dbError } from '@/kernel/errors';
import { revalidatePath } from 'next/cache';
import {
  type MemberAnswer, type MemberAnswerWrite, leftToMember, composeMemberName,
} from './familyShape';

/**
 * A family's members: the doors.
 *
 * A member is born through its family - there is no other way in - and
 * declares nothing. This file writes the member row and its answers, and
 * reads them back; the resolution of a member's structure through its family
 * lives in familyShape and is applied by every package reader in domain.ts.
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

/** The family's own bundle rows with what it leaves to members - what a member form asks. */
async function familyRows(orgId: string, familyId: string) {
  const { data: family } = await supabaseAdmin
    .from('packages').select('id, name, member_of')
    .eq('id', familyId).eq('organization_id', orgId).maybeSingle();
  if (!family) throw new Error('That family was not found.');
  // One level for now: a member of a member would resolve through two
  // families, and nothing reads that yet. Refused rather than half-done.
  if (family.member_of) throw new Error('A member cannot have members of its own yet.');
  const { data: rows } = await supabaseAdmin
    .from('package_services')
    .select(`
      id, decided_by, service:services(id, name),
      package_deliverables(deliverable_id, decided_by, deliverable:deliverables(id, name)),
      package_variable_values(answered_by, variable:variables(id, key, label, kind, unit, options, deliverable_id))
    `)
    .eq('package_id', familyId).eq('organization_id', orgId).order('position');
  return { family: family as { id: string; name: string }, rows: (rows || []) as any[] };
}

/** Only answers about things the family actually left to members are kept; the rest are refused. */
function validAnswers(rows: any[], answers: MemberAnswerWrite[]) {
  const left = leftToMember(rows);
  const ok = (a: MemberAnswerWrite) => {
    if (a.kind === 'service') return left.services.some((s) => s.packageServiceId === a.packageServiceId);
    if (a.kind === 'promise') return left.promises.some((p) => p.packageServiceId === a.packageServiceId && p.deliverableId === a.refId);
    return left.variables.some((v) => v.packageServiceId === a.packageServiceId && v.variableId === a.refId);
  };
  const bad = answers.find((a) => !ok(a));
  if (bad) throw new Error('That is not something this family leaves to its members.');
  return left;
}

function answerRows(orgId: string, memberId: string, answers: MemberAnswerWrite[]) {
  return answers
    .filter((a) => a.kind !== 'variable' ? a.value !== undefined && a.value !== null && a.value !== ''
      : (a.answeredBy === 'client' || (a.value !== undefined && a.value !== null && a.value !== '')))
    .map((a) => ({
      organization_id: orgId,
      member_id: memberId,
      package_service_id: a.packageServiceId,
      kind: a.kind,
      ref_id: a.kind === 'service' ? null : a.refId,
      value: a.kind === 'variable' && a.answeredBy === 'client' ? null
        : a.kind === 'service' ? Boolean(a.value)
        : a.kind === 'promise' ? Number(a.value)
        : a.value,
      answered_by: a.kind === 'variable' && a.answeredBy === 'client' ? 'client' : 'studio',
    }));
}

export async function createMember(input: {
  memberOf: string;
  name?: string | null;
  price?: number | null;
  answers: MemberAnswerWrite[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { family, rows } = await familyRows(orgId, input.memberOf);
  const left = validAnswers(rows, input.answers);
  const currency = await getStudioCurrency();
  const name = (input.name || '').trim() || composeMemberName(family.name, left, input.answers);

  const { data: made, error } = await supabaseAdmin
    .from('packages')
    .insert({
      organization_id: orgId,
      member_of: family.id,
      name,
      /* Nothing else of its own: description, form, duration, stages are the
         family's and are read through member_of. Null here means "inherit". */
      description: null, short_description: null, duration_minutes: null,
      extra_stages: [], form_schema: [],
      price: input.price != null ? { base_price: input.price, currency } : {},
      status: 'active',
    })
    .select('id').single();
  if (error || !made) { console.error('Failed to create the member:', error); throw dbError('Could not create the member', error); }

  const links = answerRows(orgId, made.id, input.answers);
  if (links.length > 0) {
    const { error: aErr } = await supabaseAdmin.from('package_member_answers').insert(links);
    if (aErr) {
      await supabaseAdmin.from('packages').delete().eq('id', made.id).eq('organization_id', orgId);
      console.error('Failed to write the member\'s answers:', aErr);
      throw dbError('Could not create the member', aErr);
    }
  }
  await logEvent({ organizationId: orgId, entityType: 'package', entityId: made.id, action: 'created', actorId: actorId ?? undefined, payload: { memberOf: family.id, name } });
  revalidatePath('/packages');
  return { id: made.id as string, name };
}

export async function updateMember(input: {
  memberId: string;
  name?: string | null;
  price?: number | null;
  answers?: MemberAnswerWrite[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { data: member } = await supabaseAdmin
    .from('packages').select('id, name, member_of')
    .eq('id', input.memberId).eq('organization_id', orgId).maybeSingle();
  if (!member?.member_of) throw new Error('That package is not a member of a family.');
  const { family, rows } = await familyRows(orgId, member.member_of);

  const patch: Record<string, unknown> = {};
  if (input.price !== undefined) {
    const currency = await getStudioCurrency();
    patch.price = input.price != null ? { base_price: input.price, currency } : {};
  }
  if (input.answers !== undefined) {
    const left = validAnswers(rows, input.answers);
    const { error: clearErr } = await supabaseAdmin
      .from('package_member_answers').delete()
      .eq('organization_id', orgId).eq('member_id', member.id);
    if (clearErr) throw dbError('Could not save the member', clearErr);
    const links = answerRows(orgId, member.id, input.answers);
    if (links.length > 0) {
      const { error } = await supabaseAdmin.from('package_member_answers').insert(links);
      if (error) throw dbError('Could not save the member', error);
    }
    // A name never typed keeps composing from the answers.
    if (input.name === undefined || !(input.name || '').trim()) {
      patch.name = composeMemberName(family.name, left, input.answers);
    }
  }
  if ((input.name || '').trim()) patch.name = (input.name as string).trim();
  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin.from('packages').update(patch).eq('id', member.id).eq('organization_id', orgId);
    if (error) throw dbError('Could not save the member', error);
  }
  await logEvent({ organizationId: orgId, entityType: 'package', entityId: member.id, action: 'updated', actorId: actorId ?? undefined, payload: patch });
  revalidatePath('/packages');
  revalidatePath(`/packages/${member.id}`);
  revalidatePath(`/packages/${family.id}`);
  return { id: member.id as string };
}

/** What a family leaves to its members, for the member form. */
export async function getLeftToMember(familyId: string) {
  const { orgId } = await getAuthOrgId();
  const { family, rows } = await familyRows(orgId, familyId);
  return { family, left: leftToMember(rows) };
}

/** A member's own answers, for its edit form. */
export async function getMemberAnswers(memberId: string): Promise<MemberAnswerWrite[]> {
  const { orgId } = await getAuthOrgId();
  const byMember = await memberAnswersOf(orgId, [memberId]);
  return (byMember[memberId] || []).map((a) => ({
    packageServiceId: a.package_service_id, kind: a.kind, refId: a.ref_id, value: a.value, answeredBy: a.answered_by,
  }));
}
