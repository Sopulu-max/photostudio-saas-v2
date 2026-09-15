'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  planMoveToFamily, moveToFamily, makeFamilyFrom, type MovePlan,
} from '@/modules/packages/interface';
import { toast, readableError } from '@/components/Toast';

/**
 * Two doors out of standing alone.
 *
 * MOVE: the package joins a family it fits. The plan is shown before anything
 * is written - what its values become, where it differs from what the family
 * fixes, what cannot be reconciled - and a difference is resolved the one way
 * a difference between family members ever is: by leaving that thing to
 * members. Widening says so out loud, because it changes every member's form.
 *
 * MAKE: the package becomes the first member of a new family that takes its
 * structure. The studio picks what to leave open; the package's current
 * values become its answers, so it sells exactly what it sold before.
 */

export function MoveToFamilyForm({
  packageId,
  packageName,
  families,
}: {
  packageId: string;
  packageName: string;
  families: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [familyId, setFamilyId] = useState(families[0]?.id ?? '');
  const [plan, setPlan] = useState<MovePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [widen, setWiden] = useState(false);

  useEffect(() => {
    if (!familyId) { setPlan(null); return; }
    let live = true;
    setPlanning(true);
    planMoveToFamily(packageId, familyId)
      .then((p) => { if (live) setPlan(p); })
      .catch((e) => { if (live) { setPlan(null); toast.bad(readableError(e, 'Could not compare.')); } })
      .finally(() => { if (live) setPlanning(false); });
    return () => { live = false; };
  }, [packageId, familyId]);

  const blocked = (plan?.blocking.length ?? 0) > 0;
  const differs = (plan?.conflicts.length ?? 0) > 0;
  const canMove = plan && !blocked && (!differs || widen);

  const move = () => startTransition(async () => {
    try {
      await moveToFamily({ packageId, familyId, widen });
      toast.ok(`${packageName} is now a member of ${plan?.family.name}.`);
      router.push(`/packages/${packageId}`);
      router.refresh();
    } catch (e: any) {
      toast.bad(readableError(e, 'Could not move the package.'));
    }
  });

  if (families.length === 0) {
    return <p className="q-empty">No families yet. Make one from this package, or build one on the packages page.</p>;
  }

  return (
    <div className="q-stack q-stack-lg">
      <div className="q-card q-section">
        <h2 className="q-section-title">Family</h2>
        <select className="q-select" value={familyId} disabled={isPending} onChange={(e) => setFamilyId(e.target.value)} style={{ maxWidth: '24rem' }}>
          {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {planning && <p className="q-meta-sm">Comparing…</p>}

      {plan && !planning && (
        <>
          {plan.answers.length > 0 && (
            <div className="q-card q-section">
              <h2 className="q-section-title">Becomes its answers</h2>
              <p className="q-meta" style={{ marginBottom: '12px' }}>What {plan.family.name} leaves to members, as this package has it.</p>
              <div className="q-print-facts">
                {plan.answers.map((a, i) => (
                  <div key={i} className="q-print-fact">
                    <span className="q-print-key">{a.label}</span>
                    <span className="q-print-val">{a.said}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {differs && (
            <div className="q-card q-section">
              <h2 className="q-section-title">Differs from what {plan.family.name} fixes</h2>
              <div className="q-print-facts">
                {plan.conflicts.map((c, i) => (
                  <div key={i} className="q-print-fact">
                    <span className="q-print-key">{c.label}</span>
                    <span className="q-print-val">{plan.family.name}: {c.family} &middot; this package: {c.package}</span>
                  </div>
                ))}
              </div>
              <label className="q-row q-row-sm" style={{ marginTop: '12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={widen} disabled={isPending} onChange={(e) => setWiden(e.target.checked)} />
                <span>Leave these to members on {plan.family.name}, then move. Every member of {plan.family.name} keeps what it sells today; its form gains {plan.conflicts.length === 1 ? 'this question' : 'these questions'}.</span>
              </label>
            </div>
          )}

          {blocked && (
            <div className="q-card q-section">
              <h2 className="q-section-title">Cannot be reconciled</h2>
              <ul className="q-stack q-stack-sm" style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {plan.blocking.map((b, i) => <li key={i} className="q-meta">{b}</li>)}
              </ul>
              <p className="q-meta-sm" style={{ marginTop: '10px' }}>A family and its members share services, promises and classification. Change {plan.family.name} first, or choose another family.</p>
            </div>
          )}

          {!blocked && !differs && plan.answers.length === 0 && (
            <p className="q-meta">Identical to {plan.family.name}. It would be a member with nothing of its own to decide.</p>
          )}
        </>
      )}

      <div className="q-row">
        <button type="button" className="q-btn q-btn-primary" disabled={!canMove || isPending} aria-busy={isPending} onClick={move}>
          {isPending ? 'Moving…' : `Move to ${plan?.family.name ?? 'family'}`}
        </button>
        <button type="button" className="q-btn q-btn-secondary" disabled={isPending} onClick={() => router.push(`/packages/${packageId}`)}>Cancel</button>
      </div>
    </div>
  );
}

export function MakeFamilyForm({
  packageId,
  packageName,
  rows,
}: {
  packageId: string;
  packageName: string;
  rows: {
    packageServiceId: string; serviceName: string;
    promises: { deliverableId: string; name: string; said: string }[];
    variables: { variableId: string; label: string; said: string }[];
  }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(`${packageName} family`);
  const [leave, setLeave] = useState<Set<string>>(new Set());
  const key = (kind: string, psId: string, ref: string | null) => `${kind}:${psId}:${ref ?? ''}`;
  const toggle = (k: string) => setLeave((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const submit = () => startTransition(async () => {
    try {
      const chosen = [...leave].map((k) => {
        const [kind, packageServiceId, ref] = k.split(':');
        return { kind: kind as 'service' | 'promise' | 'variable', packageServiceId, refId: ref || null };
      });
      const made = await makeFamilyFrom({ packageId, name, leave: chosen });
      toast.ok(`${name} made. ${packageName} is its first member.`);
      router.push(`/packages/${made.familyId}`);
      router.refresh();
    } catch (e: any) {
      toast.bad(readableError(e, 'Could not make the family.'));
    }
  });

  const Check = ({ k, label, said }: { k: string; label: string; said: string }) => (
    <label className="q-tile q-row q-row-between" style={{ cursor: 'pointer' }}>
      <span className="q-row q-row-sm">
        <input type="checkbox" checked={leave.has(k)} disabled={isPending} onChange={() => toggle(k)} />
        <strong className="q-strong">{label}</strong>
      </span>
      <span className="q-meta-sm">{leave.has(k) ? `Left to members · this one: ${said}` : said}</span>
    </label>
  );

  return (
    <div className="q-stack q-stack-lg">
      <div className="q-card q-section">
        <h2 className="q-section-title">Name</h2>
        <input className="q-input" value={name} disabled={isPending} onChange={(e) => setName(e.target.value)} style={{ maxWidth: '24rem' }} />
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">Left to members</h2>
        <p className="q-meta" style={{ marginBottom: '12px' }}>
          Tick what each member decides for itself. Everything else stays fixed on the family. {packageName} becomes the first member and keeps what it sells today.
        </p>
        <div className="q-stack q-stack-md">
          {rows.map((r) => (
            <div key={r.packageServiceId} className="q-stack q-stack-sm">
              <span className="q-print-from">{r.serviceName}</span>
              <Check k={key('service', r.packageServiceId, null)} label={`${r.serviceName} — in or out`} said="In" />
              {r.promises.map((p) => <Check key={p.deliverableId} k={key('promise', r.packageServiceId, p.deliverableId)} label={`${p.name} — quantity`} said={p.said} />)}
              {r.variables.map((v) => <Check key={v.variableId} k={key('variable', r.packageServiceId, v.variableId)} label={v.label} said={v.said} />)}
            </div>
          ))}
        </div>
      </div>

      <div className="q-row">
        <button type="button" className="q-btn q-btn-primary" disabled={isPending || !name.trim()} aria-busy={isPending} onClick={submit}>
          {isPending ? 'Making…' : 'Make the family'}
        </button>
        <button type="button" className="q-btn q-btn-secondary" disabled={isPending} onClick={() => router.push(`/packages/${packageId}`)}>Cancel</button>
      </div>
    </div>
  );
}
