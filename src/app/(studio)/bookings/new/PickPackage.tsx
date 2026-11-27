'use client';

import Link from 'next/link';
import { Minus, Plus } from 'lucide-react';
import { promisesOf, sayPromises, type PackageElement } from '@/weave/packages/elements';
import type { Package } from '@/weave/packages/shape';
import type { PackageMedia } from '@/weave/packages/media';
import type { Deliverable } from '@/weave/deliverables/shape';
import { MAX_PACKAGE_QUANTITY, type PackageQuantity } from '@/weave/bookings/shape';
import { money } from '@/weave/store/shape';

/**
 * Which package this booking is for, shown as the work.
 *
 * It was a dropdown, which asked a studio to recognise its own offers by name
 * alone — the cover, the promise and the price all hidden behind a caret, on
 * the one screen where what is being sold is the thing being decided.
 *
 * Each offer has a quantity here because one booking can include more than
 * one unit of an offer, or several different offers.
 *
 * WHAT IT PROMISES IS COUNTED off the package's own elements, never read from
 * `packages.pictures_promised`. That column was a number typed beside the
 * layout, so a package could show four picture slots and promise six.
 */
export function PickPackage({
  catalogue, elements, deliverables, media, selection, onAdjust, disabled,
}: {
  catalogue: Package[];
  elements: PackageElement[];
  deliverables: Deliverable[];
  media: PackageMedia[];
  selection: PackageQuantity[];
  onAdjust: (packageId: string, delta: -1 | 1) => void;
  disabled: boolean;
}) {
  if (catalogue.length === 0) {
    return (
      <p className="q-auth-hint">
        No packages. <Link className="q-auth-link" href="/packages">Add one</Link> to
        book against what the studio sells.
      </p>
    );
  }

  return (
    <div className="q-choice-grid">
      {catalogue.map((p) => {
        const mine = elements.filter((e) => e.packageId === p.id);
        const promise = promisesOf(mine, deliverables);
        const shots = media.filter((m) => m.packageId === p.id);
        const cover = shots[0] ?? null;
        const quantity = selection.find((line) => line.packageId === p.id)?.quantity ?? 0;

        return (
          <article className="q-package-option" key={p.id} data-selected={quantity > 0}>
            <span className="q-offer-art">
              {cover ? (
                cover.kind === 'video' ? (
                  <video
                    className="q-offer-frame" src={cover.url}
                    muted loop playsInline preload="metadata"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className="q-offer-frame" src={cover.url} alt="" />
                )
              ) : (
                <span className="q-offer-bare">No pictures yet</span>
              )}
              {shots.length > 1 && <span className="q-offer-more">{shots.length}</span>}
            </span>

            <span className="q-offer-says">
              {/* The studio's own name for it, exactly as typed. */}
              <strong className="q-offer-name">{p.name}</strong>
              <span className="q-meta-sm">{sayPromises(promise)}</span>
              <span className="q-offer-price">
                {p.price === null ? 'No price set' : money(p.price, p.currency)}
              </span>
            </span>
            <div className="q-package-controls">
              {quantity > 0 && (
                <button className="q-btn q-btn-secondary q-btn-sm" type="button"
                  aria-label={`Remove one ${p.name}`} disabled={disabled}
                  onClick={() => onAdjust(p.id, -1)}>
                  <Minus size={16} aria-hidden="true" />
                </button>
              )}
              <span className="q-package-quantity" aria-live="polite" aria-atomic="true">
                {quantity > 0 && `Qty ${quantity}`}
              </span>
              <button className="q-btn q-btn-secondary q-btn-sm q-package-add" type="button"
                aria-label={`Add one ${p.name}`} disabled={disabled || quantity >= MAX_PACKAGE_QUANTITY}
                onClick={() => onAdjust(p.id, 1)}>
                <Plus size={16} aria-hidden="true" />
                {quantity === 0 && 'Add package'}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
