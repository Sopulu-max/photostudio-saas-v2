'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateService, setServiceStatus } from '@/modules/services/interface';

type Blueprint = { id: string; name: string };

/**
 * A service was write-once until now — you could create one and never fix a
 * price. Edits are held locally and committed with Save (one round trip), the
 * same shape as the stage and schedule editors.
 */
export function ServiceEditor({
  serviceId,
  name: initialName,
  description: initialDescription,
  basePrice: initialPrice,
  depositPercentage: initialDeposit,
  blueprintId: initialBlueprint,
  status,
  currencyCode,
  blueprints,
}: {
  serviceId: string;
  name: string;
  description: string | null;
  basePrice: number;
  depositPercentage: number;
  blueprintId: string | null;
  status: string;
  currencyCode: string;
  blueprints: Blueprint[];
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [price, setPrice] = useState(String(initialPrice ?? 0));
  const [deposit, setDeposit] = useState(String(initialDeposit ?? 0));
  const [blueprintId, setBlueprintId] = useState(initialBlueprint ?? '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty =
    name.trim() !== initialName ||
    description !== (initialDescription ?? '') ||
    price !== String(initialPrice ?? 0) ||
    deposit !== String(initialDeposit ?? 0) ||
    blueprintId !== (initialBlueprint ?? '');

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });

  const save = () =>
    run(() => updateService({
      serviceId,
      name,
      description: description.trim() || null,
      basePrice: price === '' ? 0 : parseFloat(price),
      depositPercentage: deposit === '' ? 0 : parseInt(deposit, 10),
      blueprintId: blueprintId || null,
    }));

  const retired = status === 'retired';

  return (
    <div className="q-stack q-stack-md">
      <div className="q-field">
        <label className="q-label">Name</label>
        <input className="q-input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="q-field">
        <label className="q-label">Description</label>
        <textarea className="q-textarea" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="What the client gets. Shown on the booking page." />
      </div>

      <div className="q-grid-2">
        <div className="q-field">
          <label className="q-label">Base price ({currencyCode})</label>
          <input className="q-input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="q-field">
          <label className="q-label">Deposit (%)</label>
          <input className="q-input" type="number" min="0" max="100" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </div>
      </div>

      <div className="q-field">
        <label className="q-label">Blueprint</label>
        <select className="q-select" value={blueprintId} onChange={(e) => setBlueprintId(e.target.value)}>
          <option value="">No blueprint — work starts from a single stage</option>
          {blueprints.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <span className="q-meta-sm">Where this service&rsquo;s work starts from when you begin production on a booking.</span>
      </div>

      <div className="q-row">
        <button className="q-btn q-btn-primary" disabled={isPending || !dirty} onClick={save}>
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        <span className="q-spacer" />
        <button
          className="q-btn q-btn-secondary"
          disabled={isPending}
          onClick={() => run(() => setServiceStatus({ serviceId, status: retired ? 'active' : 'retired' }))}
        >
          {retired ? 'Make sellable again' : 'Retire this service'}
        </button>
      </div>

      {!retired ? (
        <span className="q-meta-sm">
          Retiring hides it from new bookings. Past bookings keep their line and price — nothing is deleted.
        </span>
      ) : (
        <div className="q-note q-note-warn">
          <span className="q-meta-plain">Retired — it won&rsquo;t appear when adding services to a booking.</span>
        </div>
      )}
    </div>
  );
}
