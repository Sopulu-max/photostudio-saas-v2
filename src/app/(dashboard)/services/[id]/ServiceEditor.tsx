'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateService, setServiceStatus } from '@/modules/services/interface';
import type { PaymentPolicy } from '@/modules/services/interface';
import { DURATION_CHOICES } from '@/kernel/currency';

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
  paymentPolicy: initialPolicy,
  depositPercentage: initialDeposit,
  blueprintId: initialBlueprint,
  durationMinutes: initialDuration,
  priceUnit: initialUnit,
  categoryId: initialCategory,
  status,
  currencyCode,
  blueprints,
  categories,
}: {
  serviceId: string;
  name: string;
  description: string | null;
  basePrice: number;
  paymentPolicy: PaymentPolicy;
  depositPercentage: number;
  blueprintId: string | null;
  durationMinutes: number | null;
  priceUnit: string | null;
  categoryId: string | null;
  status: string;
  currencyCode: string;
  blueprints: Blueprint[];
  categories: { id: string; name: string }[];
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [price, setPrice] = useState(String(initialPrice ?? 0));
  const [policy, setPolicy] = useState<PaymentPolicy>(initialPolicy ?? 'deposit');
  const [deposit, setDeposit] = useState(String(initialDeposit ?? 0));
  const [blueprintId, setBlueprintId] = useState(initialBlueprint ?? '');
  const [duration, setDuration] = useState(initialDuration ?? 0);
  const [unit, setUnit] = useState(initialUnit ?? '');
  const [categoryId, setCategoryId] = useState(initialCategory ?? '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty =
    name.trim() !== initialName ||
    description !== (initialDescription ?? '') ||
    price !== String(initialPrice ?? 0) ||
    policy !== (initialPolicy ?? 'deposit') ||
    deposit !== String(initialDeposit ?? 0) ||
    blueprintId !== (initialBlueprint ?? '') ||
    duration !== (initialDuration ?? 0) ||
    unit !== (initialUnit ?? '') ||
    categoryId !== (initialCategory ?? '');

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
      paymentPolicy: policy,
      depositPercentage: deposit === '' ? 0 : parseInt(deposit, 10),
      blueprintId: blueprintId || null,
      durationMinutes: duration > 0 ? duration : null,
      priceUnit: unit.trim() || null,
      categoryId: categoryId || null,
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

      <div className="q-grid-3">
        <div className="q-field">
          <label className="q-label">Base price ({currencyCode})</label>
          <input className="q-input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="q-field">
          <label className="q-label">Priced per</label>
          <input className="q-input" value={unit} onChange={(e) => setUnit(e.target.value)}
            placeholder="flat price" list="unit-suggestions" />
          <datalist id="unit-suggestions">
            <option value="hour" /><option value="day" /><option value="person" />
            <option value="image" /><option value="print" /><option value="room" />
          </datalist>
          <span className="q-meta-sm">Leave blank for a flat price. Otherwise a booking can say &ldquo;3 hours&rdquo;.</span>
        </div>

        <div className="q-field">
          <label className="q-label">Payment</label>
          <select className="q-select" value={policy} onChange={(e) => setPolicy(e.target.value as PaymentPolicy)}>
            <option value="deposit">Deposit required</option>
            <option value="full">Full payment required</option>
          </select>
        </div>
      </div>

      {policy === 'deposit' ? (
        <div className="q-field" style={{ maxWidth: '12rem' }}>
          <label className="q-label">Deposit (%)</label>
          <input className="q-input" type="number" min="0" max="100" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          <span className="q-meta-sm">0% means nothing is due to book — the full amount is invoiced later.</span>
        </div>
      ) : (
        <span className="q-meta-sm">The full price is due before the booking is confirmed. No partial option.</span>
      )}

      <div className="q-field">
        <label className="q-label">Group</label>
        <select className="q-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Ungrouped</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="q-meta-sm">How this sits in your catalogue. Manage groups on the Services page.</span>
      </div>

      <div className="q-field">
        <label className="q-label">Usually takes</label>
        <select className="q-select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
          {DURATION_CHOICES.map((d) => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
        </select>
        <span className="q-meta-sm">Suggests a length when this service is added to a booking. Not every service is timed.</span>
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
