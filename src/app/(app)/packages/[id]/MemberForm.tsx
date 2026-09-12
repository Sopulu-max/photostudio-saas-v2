'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createMember, updateMember, type MemberAnswerWrite, type LeftToMember } from '@/modules/packages/interface';
import { VariableField } from '@/components/VariableField';
import { parseVariableValue } from '@/modules/services/variableTypes';
import { currencySymbol } from '@/kernel/currency';
import { toast, readableError } from '@/components/Toast';

/**
 * A member of a family: the form is what the family left to it, nothing else.
 *
 * Not the package editor. A member declares no services, promises nothing of
 * its own, narrows nothing - its structure is the family's. So the form is
 * derived from the family's rows marked "left to the member": a service in or
 * out, a promise's quantity, a variable fixed here or handed to the client,
 * and the price. The name composes from the answers until it is typed.
 */
export function MemberForm({
  family,
  left,
  currencyCode,
  initial,
}: {
  family: { id: string; name: string };
  left: LeftToMember;
  currencyCode: string;
  initial?: { id: string; name: string; price: number | null; answers: MemberAnswerWrite[] };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const find = (kind: MemberAnswerWrite['kind'], psId: string, ref?: string | null) =>
    (initial?.answers || []).find((a) => a.kind === kind && a.packageServiceId === psId && (kind === 'service' || a.refId === ref));

  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : '');
  const [services, setServices] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(left.services.map((s) => [s.packageServiceId, find('service', s.packageServiceId)?.value !== false])));
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(left.promises.map((p) => {
      const a = find('promise', p.packageServiceId, p.deliverableId);
      return [`${p.packageServiceId}:${p.deliverableId}`, a?.value != null ? String(a.value) : ''];
    })));
  const [who, setWho] = useState<Record<string, 'studio' | 'client' | ''>>(() =>
    Object.fromEntries(left.variables.map((v) => {
      const a = find('variable', v.packageServiceId, v.variableId);
      return [`${v.packageServiceId}:${v.variableId}`, a ? (a.answeredBy === 'client' ? 'client' : 'studio') : ''];
    })));
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(left.variables.map((v) => {
      const a = find('variable', v.packageServiceId, v.variableId);
      return [`${v.packageServiceId}:${v.variableId}`, a?.value != null ? String(a.value) : ''];
    })));

  const answers = (): MemberAnswerWrite[] => [
    ...left.services.map((s) => ({ packageServiceId: s.packageServiceId, kind: 'service' as const, value: services[s.packageServiceId] !== false })),
    ...left.promises.flatMap<MemberAnswerWrite>((p) => {
      const raw = quantities[`${p.packageServiceId}:${p.deliverableId}`];
      return raw === '' || raw == null ? [] : [{ packageServiceId: p.packageServiceId, kind: 'promise' as const, refId: p.deliverableId, value: Number(raw) }];
    }),
    ...left.variables.flatMap<MemberAnswerWrite>((v) => {
      const k = `${v.packageServiceId}:${v.variableId}`;
      const w = who[k];
      if (w === 'client') return [{ packageServiceId: v.packageServiceId, kind: 'variable' as const, refId: v.variableId, answeredBy: 'client' as const, value: null }];
      if (w === 'studio' && (values[k] ?? '') !== '') {
        return [{ packageServiceId: v.packageServiceId, kind: 'variable' as const, refId: v.variableId, answeredBy: 'studio' as const, value: parseVariableValue(v.kind as any, values[k]) }];
      }
      return [];
    }),
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const priceNum = price.trim() === '' ? null : Number(price);
        if (initial) {
          await updateMember({ memberId: initial.id, name: name.trim() || null, price: priceNum, answers: answers() });
          toast.ok('Saved.');
          router.push(`/packages/${initial.id}`);
        } else {
          const made = await createMember({ memberOf: family.id, name: name.trim() || null, price: priceNum, answers: answers() });
          toast.ok(`${made.name} added to ${family.name}.`);
          router.push(`/packages/${made.id}`);
        }
        router.refresh();
      } catch (err: any) {
        toast.bad(readableError(err, 'Could not save the member.'));
      }
    });
  };

  const nothingLeft = left.services.length + left.promises.length + left.variables.length === 0;

  return (
    <form className="q-form q-stack q-stack-lg" onSubmit={submit}>
      {left.services.length > 0 && (
        <div className="q-card q-section">
          <h2 className="q-section-title">Services</h2>
          <div className="q-stack q-stack-sm">
            {left.services.map((s) => (
              <label key={s.packageServiceId} className="q-tile q-row q-row-between" style={{ cursor: 'pointer' }}>
                <strong className="q-strong">{s.name}</strong>
                <span className="q-row q-row-sm q-meta-sm">
                  <input type="checkbox" checked={services[s.packageServiceId] !== false} disabled={isPending}
                    onChange={(e) => setServices((prev) => ({ ...prev, [s.packageServiceId]: e.target.checked }))} />
                  {services[s.packageServiceId] !== false ? 'In' : 'Out'}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {left.promises.length > 0 && (
        <div className="q-card q-section">
          <h2 className="q-section-title">Deliverables</h2>
          <div className="q-stack q-stack-sm">
            {left.promises.map((p) => {
              const k = `${p.packageServiceId}:${p.deliverableId}`;
              return (
                <div key={k} className="q-tile q-row q-row-between" style={{ flexWrap: 'wrap' }}>
                  <div>
                    <strong className="q-strong">{p.name}</strong>
                    <span className="q-print-from">{p.serviceName}</span>
                  </div>
                  <div className="q-row q-row-sm">
                    <input className="q-input q-input-sm" type="number" min={0} placeholder="Quantity" style={{ maxWidth: '7rem' }}
                      value={quantities[k] ?? ''} disabled={isPending}
                      onChange={(e) => setQuantities((prev) => ({ ...prev, [k]: e.target.value }))} />
                    <span className="q-meta-sm">{quantities[k] === '0' ? 'Not promised' : ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {left.variables.length > 0 && (
        <div className="q-card q-section">
          <h2 className="q-section-title">Variables</h2>
          <div className="q-stack q-stack-sm">
            {left.variables.map((v) => {
              const k = `${v.packageServiceId}:${v.variableId}`;
              const w = who[k];
              return (
                <div key={k} className="q-tile q-row q-row-between" style={{ flexWrap: 'wrap' }}>
                  <div>
                    <strong className="q-strong">{v.label}</strong>
                    <span className="q-print-from">{v.serviceName}</span>
                  </div>
                  <div className="q-row">
                    <select className="q-select" value={w} disabled={isPending} style={{ minWidth: '9rem' }}
                      onChange={(e) => setWho((prev) => ({ ...prev, [k]: e.target.value as any }))}>
                      <option value="">Not decided</option>
                      <option value="studio">We set it</option>
                      <option value="client">The client chooses</option>
                    </select>
                    <VariableField
                      kind={v.kind as any}
                      value={w === 'studio' ? (values[k] ?? '') : ''}
                      onChange={(next) => setValues((prev) => ({ ...prev, [k]: Array.isArray(next) ? next.join(',') : next }))}
                      options={v.options || []}
                      unit={v.unit}
                      disabled={isPending || w !== 'studio'}
                      emptyLabel={w === 'client' ? 'The client fills this in' : '—'}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {nothingLeft && (
        <p className="q-empty">{family.name} leaves nothing to its members yet. Mark something &ldquo;left to the member&rdquo; on the family first.</p>
      )}

      <div className="q-card q-section">
        <h2 className="q-section-title">Price</h2>
        <div className="q-price-field">
          <span className="q-price-sym">{currencySymbol(currencyCode) || currencyCode}</span>
          <input type="number" className="q-price-input" value={price} min={0} step="0.01" placeholder="0"
            disabled={isPending} onChange={(e) => setPrice(e.target.value)} aria-label={`Price in ${currencyCode}`} />
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">Name</h2>
        <div className="q-field">
          <input className="q-input" value={name} disabled={isPending} placeholder={`Composed from ${family.name} and the answers above`}
            onChange={(e) => setName(e.target.value)} />
          <span className="q-meta-sm">Optional. Left empty, the name is composed and keeps up with the answers.</span>
        </div>
      </div>

      <div className="q-row">
        <button type="submit" className="q-btn q-btn-primary" disabled={isPending || nothingLeft} aria-busy={isPending}>
          {isPending ? 'Saving…' : initial ? 'Save' : `Add to ${family.name}`}
        </button>
        <button type="button" className="q-btn q-btn-secondary" disabled={isPending}
          onClick={() => router.push(`/packages/${initial?.id ?? family.id}`)}>Cancel</button>
      </div>
    </form>
  );
}
