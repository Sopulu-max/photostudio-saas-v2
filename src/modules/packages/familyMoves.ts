'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { dbError } from '@/kernel/errors';
import { revalidatePath } from 'next/cache';
import { formatVariableValue } from '@/modules/services/variableTypes';
import { type MemberAnswerWrite } from './familyShape';
import { rowsOf, same, widen } from './familyInternal';

/**
 * Moving between standalone and family.
 *
 * A member declares nothing. That rule does not forbid a standalone package
 * joining a family, or becoming the first member of a new one - it says what
 * the move has to produce: a package with no rows of its own, whose structure
 * is the family's, plus answers. So both moves here are reconciliations that
 * end in that state, and nothing is discarded silently.
 *
 * WIDENING. When a family starts leaving something to its members that it
 * used to fix, every member that has no answer of its own is given the
 * family's old value as its answer. Otherwise the act of opening a question
 * would silently change what every existing member sells. keepMembersWhole
 * does this, and the editor and both moves go through it.
 */

export type MoveConflict = {
  kind: 'service' | 'promise' | 'variable';
  packageServiceId: string;
  refId: string | null;
  label: string;
  family: string;
  package: string;
  /** Leaving this to members on the family resolves it. */
  widenable: boolean;
};

export type MovePlan = {
  family: { id: string; name: string };
  package: { id: string; name: string };
  /** What the package's current values become, on the family's open rows. */
  answers: (MemberAnswerWrite & { label: string; said: string })[];
  /** Where the package differs from what the family fixes. */
  conflicts: MoveConflict[];
  /** Differences no widening can absorb. */
  blocking: string[];
};

/**
 * What it would take for this standalone package to be a member of this
 * family: which of its values become answers, where it differs from what the
 * family fixes (resolvable by leaving those things to members), and what
 * cannot be reconciled at all.
 */
export async function planMoveToFamily(packageId: string, familyId: string): Promise<MovePlan> {
  const { orgId } = await getAuthOrgId();
  const { data: heads } = await supabaseAdmin
    .from('packages').select('id, name, member_of, is_family, instance_of')
    .eq('organization_id', orgId).in('id', [packageId, familyId]);
  const pkg = (heads || []).find((h: any) => h.id === packageId) as any;
  const fam = (heads || []).find((h: any) => h.id === familyId) as any;
  if (!pkg || !fam) throw new Error('Package not found');
  if (pkg.member_of) throw new Error('That package is already a member of a family.');
  if (pkg.instance_of) throw new Error('A booking\'s copy cannot join a family.');
  if (fam.member_of) throw new Error('A member cannot have members of its own yet.');

  const [mine, theirs] = await Promise.all([rowsOf(orgId, packageId), rowsOf(orgId, familyId)]);
  const plan: MovePlan = { family: { id: fam.id, name: fam.name }, package: { id: pkg.id, name: pkg.name }, answers: [], conflicts: [], blocking: [] };

  // Services the package bundles that the family does not: nothing to answer against.
  for (const m of mine) {
    if (!theirs.some((t) => t.service_id === m.service_id)) {
      plan.blocking.push(`This package bundles ${m.service?.name ?? 'a service'}; ${fam.name} does not.`);
    }
  }

  for (const t of theirs) {
    const m = mine.find((x) => x.service_id === t.service_id);
    const sName = t.service?.name ?? '';
    if (t.decided_by === 'member') {
      plan.answers.push({ packageServiceId: t.id, kind: 'service', value: Boolean(m), label: sName, said: m ? 'In' : 'Out' });
    } else if (!m) {
      plan.conflicts.push({ kind: 'service', packageServiceId: t.id, refId: null, label: sName, family: 'Bundled', package: 'Not bundled', widenable: true });
    }
    if (!m) continue;

    // Narrowings must agree exactly: v1 inherits them whole.
    const narrowMine = new Set(m.package_service_dimension_values.map((l) => l.dimension_value_id));
    const narrowTheirs = new Set(t.package_service_dimension_values.map((l) => l.dimension_value_id));
    if (narrowMine.size !== narrowTheirs.size || [...narrowMine].some((v) => !narrowTheirs.has(v))) {
      plan.blocking.push(`${sName} is classified differently here than in ${fam.name}.`);
    }

    // Promises.
    for (const tp of t.package_deliverables) {
      const mp = m.package_deliverables.find((x) => x.deliverable_id === tp.deliverable_id);
      const dName = tp.deliverable?.name ?? 'a deliverable';
      if (tp.decided_by === 'member') {
        const q = mp ? (mp.quantity ?? null) : 0;
        plan.answers.push({ packageServiceId: t.id, kind: 'promise', refId: tp.deliverable_id, value: q ?? 0, label: dName, said: q ? String(q) : 'Not promised' });
      } else if (!mp) {
        plan.conflicts.push({ kind: 'promise', packageServiceId: t.id, refId: tp.deliverable_id, label: dName, family: tp.quantity != null ? String(tp.quantity) : 'Included', package: 'Not promised', widenable: true });
      } else if (!same(mp.quantity, tp.quantity)) {
        plan.conflicts.push({ kind: 'promise', packageServiceId: t.id, refId: tp.deliverable_id, label: dName, family: tp.quantity != null ? String(tp.quantity) : 'Included', package: mp.quantity != null ? String(mp.quantity) : 'Included', widenable: true });
      }
    }
    for (const mp of m.package_deliverables) {
      if (!t.package_deliverables.some((x) => x.deliverable_id === mp.deliverable_id)) {
        plan.blocking.push(`This package promises ${mp.deliverable?.name ?? 'a deliverable'} from ${sName}; ${fam.name} does not.`);
      }
    }

    // Variables.
    const say = (v: { value: unknown; answered_by: string; variable: any }) =>
      v.answered_by === 'client' ? 'The client chooses' : formatVariableValue({ value: v.value, unit: v.variable?.unit ?? null, kind: v.variable?.kind });
    for (const tv of t.package_variable_values) {
      const mv = m.package_variable_values.find((x) => x.variable_id === tv.variable_id);
      const label = tv.variable?.label ?? 'a variable';
      if (tv.answered_by === 'member') {
        if (mv) {
          plan.answers.push({ packageServiceId: t.id, kind: 'variable', refId: tv.variable_id, answeredBy: mv.answered_by === 'client' ? 'client' : 'studio', value: mv.answered_by === 'client' ? null : mv.value, label, said: say(mv) });
        }
        continue;
      }
      if (!mv) {
        plan.conflicts.push({ kind: 'variable', packageServiceId: t.id, refId: tv.variable_id, label, family: say(tv), package: 'Not decided', widenable: true });
      } else if (mv.answered_by !== tv.answered_by || !same(mv.value, tv.value)) {
        plan.conflicts.push({ kind: 'variable', packageServiceId: t.id, refId: tv.variable_id, label, family: say(tv), package: say(mv), widenable: true });
      }
    }
    for (const mv of m.package_variable_values) {
      if (!t.package_variable_values.some((x) => x.variable_id === mv.variable_id)) {
        plan.conflicts.push({ kind: 'variable', packageServiceId: t.id, refId: mv.variable_id, label: mv.variable?.label ?? 'a variable', family: 'Not decided', package: say(mv), widenable: true });
      }
    }
  }
  return plan;
}

/**
 * A standalone package joins a family. Its values become answers on the
 * family's open rows; its own rows go (they cascade); it keeps its id, so its
 * bookings' provenance and its storefront link keep working. With `widen`,
 * every conflict is first left to members on the family - which is exactly
 * what the conflict was telling us the family varies by.
 */
export async function moveToFamily(input: { packageId: string; familyId: string; widen?: boolean }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  let plan = await planMoveToFamily(input.packageId, input.familyId);
  if (plan.blocking.length > 0) throw new Error(plan.blocking[0]);
  if (plan.conflicts.length > 0) {
    if (!input.widen) throw new Error(`${plan.conflicts.length} ${plan.conflicts.length === 1 ? 'thing differs' : 'things differ'} from what ${plan.family.name} fixes.`);
    await widen(orgId, input.familyId, plan.conflicts.map((c) => ({ kind: c.kind, packageServiceId: c.packageServiceId, refId: c.refId })));
    plan = await planMoveToFamily(input.packageId, input.familyId);
    if (plan.conflicts.length > 0 || plan.blocking.length > 0) throw new Error('Could not reconcile this package with the family.');
  }

  const links = plan.answers
    .filter((a) => a.kind !== 'variable' || a.answeredBy === 'client' || (a.value !== null && a.value !== undefined && a.value !== ''))
    .map((a) => ({
      organization_id: orgId, member_id: input.packageId, package_service_id: a.packageServiceId, kind: a.kind,
      ref_id: a.kind === 'service' ? null : a.refId,
      value: a.kind === 'variable' && a.answeredBy === 'client' ? null : a.value,
      answered_by: a.kind === 'variable' && a.answeredBy === 'client' ? 'client' : 'studio',
    }));
  if (links.length > 0) {
    const { error } = await supabaseAdmin.from('package_member_answers').insert(links);
    if (error) throw dbError('Could not move the package', error);
  }
  // The row becomes a member: its own structure goes (cascade), what it
  // inherits is nulled so it reads through the family.
  const { error: rowsErr } = await supabaseAdmin.from('package_services').delete().eq('package_id', input.packageId).eq('organization_id', orgId);
  if (rowsErr) throw dbError('Could not move the package', rowsErr);
  const { error } = await supabaseAdmin.from('packages')
    .update({ member_of: input.familyId, is_family: false, description: null, short_description: null, duration_minutes: null, extra_stages: [], form_schema: [] })
    .eq('id', input.packageId).eq('organization_id', orgId);
  if (error) throw dbError('Could not move the package', error);

  await logEvent({ organizationId: orgId, entityType: 'package', entityId: input.packageId, action: 'moved_to_family', actorId: actorId ?? undefined, payload: { familyId: input.familyId, widened: plan.conflicts.length } });
  revalidatePath('/packages');
  revalidatePath(`/packages/${input.packageId}`);
  revalidatePath(`/packages/${input.familyId}`);
  return { id: input.packageId, familyId: input.familyId };
}

/**
 * A family made from a standalone package. A new family row takes the
 * package's bundle rows - the same rows, re-keyed, so nothing keyed on them
 * moves - and the package becomes its first member, keeping its id, name,
 * price, pictures and bookings. What the studio chooses to leave open is
 * opened on the family, and the package's current values become its answers.
 */
export async function makeFamilyFrom(input: {
  packageId: string;
  name: string;
  leave: { kind: 'service' | 'promise' | 'variable'; packageServiceId: string; refId: string | null }[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { data: pkg } = await supabaseAdmin
    .from('packages').select('id, name, description, short_description, duration_minutes, extra_stages, form_schema, contract_terms, member_of, instance_of')
    .eq('id', input.packageId).eq('organization_id', orgId).maybeSingle();
  if (!pkg) throw new Error('Package not found');
  if (pkg.member_of) throw new Error('That package is already a member of a family.');
  if (pkg.instance_of) throw new Error('A booking\'s copy cannot become a family.');
  const name = input.name.trim();
  if (!name) throw new Error('The family needs a name.');

  const { data: fam, error } = await supabaseAdmin
    .from('packages')
    .insert({
      organization_id: orgId, name, is_family: true, status: 'active',
      description: pkg.description, short_description: pkg.short_description, duration_minutes: pkg.duration_minutes,
      extra_stages: pkg.extra_stages ?? [], form_schema: pkg.form_schema ?? [], contract_terms: pkg.contract_terms ?? null,
      price: {},
    })
    .select('id').single();
  if (error || !fam) throw dbError('Could not make the family', error);

  // The structure changes owner once. Same rows, same ids.
  const { error: moveErr } = await supabaseAdmin.from('package_services').update({ package_id: fam.id }).eq('package_id', pkg.id).eq('organization_id', orgId);
  if (moveErr) {
    await supabaseAdmin.from('packages').delete().eq('id', fam.id).eq('organization_id', orgId);
    throw dbError('Could not make the family', moveErr);
  }
  const { error: memErr } = await supabaseAdmin.from('packages')
    .update({ member_of: fam.id, is_family: false, description: null, short_description: null, duration_minutes: null, extra_stages: [], form_schema: [] })
    .eq('id', pkg.id).eq('organization_id', orgId);
  if (memErr) throw dbError('Could not make the family', memErr);

  // Now a member exists, widening gives it the old values as its answers.
  await widen(orgId, fam.id, input.leave);

  await logEvent({ organizationId: orgId, entityType: 'package', entityId: fam.id, action: 'created', actorId: actorId ?? undefined, payload: { name, madeFrom: pkg.id } });
  revalidatePath('/packages');
  revalidatePath(`/packages/${pkg.id}`);
  return { familyId: fam.id as string, memberId: pkg.id as string };
}

/** The families a standalone package could join. */
export async function listFamilies(): Promise<{ id: string; name: string }[]> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin.from('packages').select('id, name')
    .eq('organization_id', orgId).eq('is_family', true).is('member_of', null).neq('status', 'custom').order('name');
  return ((data || []) as any[]).map((f) => ({ id: f.id, name: f.name }));
}

/** What a standalone package could leave to members, with its current values - for the make-a-family form. */
export async function whatCouldBeLeft(packageId: string) {
  const { orgId } = await getAuthOrgId();
  const rows = await rowsOf(orgId, packageId);
  return rows.map((r) => ({
    packageServiceId: r.id,
    serviceName: r.service?.name ?? '',
    promises: r.package_deliverables.map((p) => ({ deliverableId: p.deliverable_id, name: p.deliverable?.name ?? '', said: p.quantity != null ? String(p.quantity) : 'Included' })),
    variables: r.package_variable_values.map((v) => ({
      variableId: v.variable_id, label: v.variable?.label ?? '',
      said: v.answered_by === 'client' ? 'The client chooses' : formatVariableValue({ value: v.value, unit: v.variable?.unit ?? null, kind: v.variable?.kind }),
    })),
  }));
}
