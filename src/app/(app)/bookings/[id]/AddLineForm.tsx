'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addBookingLine } from '@/modules/bookings/interface';
import { formatMoney } from '@/kernel/currency';
import { toast } from '@/components/Toast';
// The same catalogue the new-booking form shows. This was a dropdown of names.
import { PackagePicker } from '@/components/PackagePicker';

type Variant = { axis_label: string; tiers: { label: string; price: number }[] };

export function AddLineForm({
  bookingId,
  packages,
  dimensions = [],
  packagesOnBooking = [],
  variantsByPackage = {},
  currencyCode = 'USD',
}: {
  bookingId: string;
  /** What a client can book — Packages, never raw Services. */
  packages: any[];
  /** Every classification the studio uses, for narrowing the catalogue. */
  dimensions?: { id: string; name: string; values: { id: string; name: string }[] }[];
  /**
   * The package each existing line points at.
   *
   * DATA, NOT A CALLBACK. This was `(packageId) => number`, handed down from
   * the edit page — which is a server component, so React could not serialise
   * it and the whole page failed to render with "Event handlers cannot be
   * passed to Client Component props". A closure cannot cross that boundary;
   * the list it would have closed over can.
   */
  packagesOnBooking?: string[];
  variantsByPackage?: Record<string, Variant | null>;
  currencyCode?: string;
}) {
  const [packageId, setPackageId] = useState('');
  const [custom, setCustom] = useState('');
  /** The catalogue's own narrowing, which belongs to the catalogue. */
  const [values, setValues] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [addingTier, setAddingTier] = useState<number | null>(null);
  const router = useRouter();

  const variant = packageId ? variantsByPackage[packageId] : null;

  /*
   * A package with priced tiers asks which one before it goes on. Everything
   * else goes on at once — the click IS the decision, and a second confirming
   * step for a choice already made is the "Add another package" button the new
   * booking form deleted.
   */
  const addPackageById = (id: string) => {
    if (variantsByPackage[id]) { setPackageId(id); return; }
    startTransition(async () => {
      try {
        await addBookingLine({ bookingId, packageId: id, title: '' });
        setPackageId('');
        router.refresh();
      } catch (e) {
        console.error(e);
        toast.bad('Failed to add it.');
      }
    });
  };

  const add = () => {
    if (!packageId && !custom.trim()) return;
    startTransition(async () => {
      try {
        await addBookingLine({
          bookingId,
          packageId: packageId || null,
          title: packageId ? '' : custom.trim(),
        });
        setPackageId('');
        setCustom('');
        router.refresh();
      } catch (e) {
        console.error(e);
        toast.bad('Failed to add it.');
      }
    });
  };

  const addTier = (i: number) => {
    if (!variant) return;
    const tier = variant.tiers[i];
    setAddingTier(i);
    startTransition(async () => {
      try {
        await addBookingLine({
          bookingId,
          packageId,
          title: '',
          price: { base_price: tier.price, currency: currencyCode, unit: tier.label },
        });
        setPackageId('');
        router.refresh();
      } catch (e) {
        console.error(e);
        toast.bad('Failed to add it.');
      } finally {
        setAddingTier(null);
      }
    });
  };

  return (
    <div className="q-stack q-stack-md" style={{ marginTop: '16px' }}>
      {/*
        * THE CATALOGUE, NOT A LIST OF NAMES.
        *
        * This was a <select> of package names — no picture, no price, no
        * services, no way to narrow by what the job actually is — while the
        * new-booking form showed the same catalogue as cards you could filter
        * by classification and search. One catalogue, two screens, two
        * completely different experiences of choosing from it, and the thinner
        * one was on the page you reach when correcting a booking.
        */}
      <PackagePicker
        packages={packages}
        dimensions={dimensions}
        values={values}
        onValuesChange={setValues}
        onChoose={(id: string) => addPackageById(id)}
        alreadyOn={(id: string) => packagesOnBooking.filter((p) => p === id).length}
        currencyCode={currencyCode}
      />

      {/*
        * A one-off charge is not a package and never was.
        *
        * Travel, an extra hour, a print run billed at cost — these have no
        * services, no deliverables and no work, and forcing them through the
        * catalogue would mean inventing a package to hold a number. Kept
        * separate, and plainly named.
        */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <input
          className="q-input"
          placeholder="or a one-off charge, e.g. Travel"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={{ minWidth: '14rem' }}
        />
        <button
          className="q-btn q-btn-secondary"
          onClick={add}
          disabled={isPending || !custom.trim()}
        >
          {isPending ? 'Adding…' : 'Add charge'}
        </button>
        {!custom.trim() && <span className="q-meta-sm">Name a one-off charge to add one.</span>}
      </div>

      {variant && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span className="q-meta-sm">{variant.axis_label}:</span>
          {variant.tiers.map((t, i) => (
            <button
              key={i}
              className="q-btn q-btn-secondary q-btn-xs"
              disabled={isPending}
              onClick={() => addTier(i)}
            >
              {addingTier === i ? 'Adding…' : `${t.label} — ${formatMoney(t.price, currencyCode)}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
