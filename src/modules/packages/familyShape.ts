/**
 * A family of packages, resolved.
 *
 * THE RULE (migration 20261027). Every row a package holds has a decider:
 * fixed here, or left to the member. A package with anything left to the
 * member is a family; one with nothing left is sellable. A member declares
 * nothing: its structure is the family's, read through member_of, and it holds
 * only its answers to what was left to it.
 *
 * These are the pure parts: given the family's raw bundle rows (as any of the
 * package reads embed them) and a member's answers, produce the bundle as that
 * member sells it. Every reader that shows a member goes through here, so the
 * meaning of "left to the member" is written once.
 */

import { formatVariableValue } from '@/modules/services/variableTypes';

export type Decider = 'studio' | 'member';
export type MemberAnswerKind = 'service' | 'promise' | 'variable';

export type MemberAnswer = {
  package_service_id: string;
  kind: MemberAnswerKind;
  ref_id: string | null;
  value: unknown;
  answered_by: 'studio' | 'client';
};

export type MemberAnswerWrite = {
  packageServiceId: string;
  kind: MemberAnswerKind;
  /** deliverable id for a promise, variable id for a variable, absent for the service itself. */
  refId?: string | null;
  /** service: true (in) / false (out). promise: the quantity. variable: the value, or null when the client answers. */
  value?: unknown;
  answeredBy?: 'studio' | 'client';
};

const promiseRef = (pd: any): string | null => pd?.deliverable_id ?? pd?.deliverable?.id ?? null;
const variableRef = (pv: any): string | null => pv?.variable_id ?? pv?.variable?.id ?? null;

/**
 * The family's bundle, as one member sells it.
 *
 * A service left to the member is dropped when the member said "out"; kept
 * when it said "in" or has not yet said. A promise left to the member takes
 * the member's quantity, and 0 means the member does not promise it. A
 * variable left to the member becomes the member's own row - a fixed value or
 * a question for the client - and is absent while the member has not decided,
 * which is the same "asked of nobody" an undecided variable already means.
 */
export function overlayMember(packageServices: any[] | null | undefined, answers: MemberAnswer[]): any[] {
  const find = (psId: string, kind: MemberAnswerKind, ref: string | null) =>
    answers.find((a) => a.package_service_id === psId && a.kind === kind && (a.ref_id ?? null) === ref);

  return ((packageServices || []) as any[])
    .filter((ps) => {
      if (ps.decided_by !== 'member') return true;
      const a = find(ps.id, 'service', null);
      return !(a && a.value === false);
    })
    .map((ps) => ({
      ...ps,
      package_deliverables: ((ps.package_deliverables || []) as any[])
        .map((pd) => {
          if (pd.decided_by !== 'member') return pd;
          const a = find(ps.id, 'promise', promiseRef(pd));
          return { ...pd, quantity: a ? Number(a.value) : null, decided_by: 'studio', member_decided: true };
        })
        .filter((pd) => !(pd.member_decided && pd.quantity === 0)),
      package_variable_values: ((ps.package_variable_values || []) as any[])
        .flatMap((pv) => {
          if (pv.answered_by !== 'member') return [pv];
          const a = find(ps.id, 'variable', variableRef(pv));
          return a ? [{ ...pv, value: a.value, answered_by: a.answered_by, member_decided: true }] : [];
        }),
    }));
}

/** Whether these bundle rows leave anything to a member - i.e. this is a family. */
export function isFamily(packageServices: any[] | null | undefined): boolean {
  return ((packageServices || []) as any[]).some((ps) =>
    ps.decided_by === 'member'
    || (ps.package_deliverables || []).some((pd: any) => pd.decided_by === 'member')
    || (ps.package_variable_values || []).some((pv: any) => pv.answered_by === 'member'));
}

export type LeftToMember = {
  services: { packageServiceId: string; serviceId: string; name: string }[];
  promises: { packageServiceId: string; serviceName: string; deliverableId: string; name: string }[];
  variables: {
    packageServiceId: string; serviceName: string; variableId: string;
    label: string; kind: string; unit: string | null; options: string[]; deliverableId: string | null;
  }[];
};

/**
 * What a family leaves to its members - the member form is exactly this list.
 * Read from the family's own rows, never from a member's.
 */
export function leftToMember(packageServices: any[] | null | undefined): LeftToMember {
  const out: LeftToMember = { services: [], promises: [], variables: [] };
  for (const ps of ((packageServices || []) as any[])) {
    const serviceName = ps.service?.name ?? '';
    if (ps.decided_by === 'member' && ps.service?.id) {
      out.services.push({ packageServiceId: ps.id, serviceId: ps.service.id, name: serviceName });
    }
    for (const pd of (ps.package_deliverables || [])) {
      if (pd.decided_by === 'member' && promiseRef(pd)) {
        out.promises.push({ packageServiceId: ps.id, serviceName, deliverableId: promiseRef(pd) as string, name: pd.deliverable?.name ?? '' });
      }
    }
    for (const pv of (ps.package_variable_values || [])) {
      if (pv.answered_by === 'member' && pv.variable) {
        out.variables.push({
          packageServiceId: ps.id, serviceName, variableId: pv.variable.id,
          label: pv.variable.label, kind: pv.variable.kind, unit: pv.variable.unit ?? null,
          options: pv.variable.options ?? [], deliverableId: pv.variable.deliverable_id ?? null,
        });
      }
    }
  }
  return out;
}

/**
 * A member's name, composed until someone names it - the same rule as
 * bookings.title_custom. "Standard packages · 2 outfits · Album" reads what the
 * member answered, in the family's order.
 */
export function composeMemberName(familyName: string, left: LeftToMember, answers: MemberAnswerWrite[]): string {
  const parts: string[] = [];
  for (const s of left.services) {
    const a = answers.find((x) => x.packageServiceId === s.packageServiceId && x.kind === 'service');
    if (a && a.value === true) parts.push(s.name);
  }
  for (const p of left.promises) {
    const a = answers.find((x) => x.packageServiceId === p.packageServiceId && x.kind === 'promise' && x.refId === p.deliverableId);
    const q = a ? Number(a.value) : NaN;
    if (Number.isFinite(q) && q > 0) parts.push(`${q} ${p.name.toLowerCase()}`);
  }
  for (const v of left.variables) {
    const a = answers.find((x) => x.packageServiceId === v.packageServiceId && x.kind === 'variable' && x.refId === v.variableId);
    if (!a || a.answeredBy === 'client' || a.value == null || a.value === '') continue;
    // The one formatter every surface uses: "2 outfits", "1 hour", "Yes".
    const said = formatVariableValue({ value: a.value, unit: v.unit, kind: v.kind });
    parts.push(v.kind === 'number' && !v.unit ? `${said} ${v.label.toLowerCase()}` : said);
  }
  return [familyName, ...parts].join(' · ');
}
