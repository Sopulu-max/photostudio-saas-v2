'use client';

import Link from 'next/link';
import { sayPromises, type PackageElement } from '@/weave/packages/elements';
import { promisesOf } from '@/weave/packages/elements';
import type { Package } from '@/weave/packages/shape';
import type { PackageMedia } from '@/weave/packages/media';
import type { Deliverable } from '@/weave/deliverables/shape';
import { money } from '@/weave/store/shape';

/**
 * Which package this booking is for, shown as the work.
 *
 * It was a dropdown, which asked a studio to recognise its own offers by name
 * alone — the cover, the promise and the price all hidden behind a caret, on
 * the one screen where what is being sold is the thing being decided.
 *
 * The same card the client sees at the studio's public address, because it is
 * the same act arriving by a different door. One difference, and it is the
 * right one: there the card OPENS the package, because a picture of something
 * is a way into it; here it SELECTS, because the operator is choosing which
 * one this booking is.
 *
 * WHAT IT PROMISES IS COUNTED off the package's own elements, never read from
 * `packages.pictures_promised`. That column was a number typed beside the
 * layout, so a package could show four picture slots and promise six.
 */
export function PickPackage({
  catalogue, elements, deliverables, media, chosen, onChoose, disabled,
}: {
  catalogue: Package[];
  elements: PackageElement[];
  deliverables: Deliverable[];
  media: PackageMedia[];
  chosen: string;
  onChoose: (packageId: string) => void;
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
        const picked = chosen === p.id;

        return (
          <button
            key={p.id}
            type="button"
            /*
             * Pressing the chosen one again clears it. A booking with no
             * package is a real state — "do you do weddings?" written down
             * before anything is settled — so there has to be a way back to
             * it, and a tile saying "No package" in a grid of photographs
             * would be a tile that is not a package.
             */
            onClick={() => onChoose(picked ? '' : p.id)}
            className={picked ? 'q-offer q-offer-on' : 'q-offer'}
            disabled={disabled}
            aria-pressed={picked}
          >
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
          </button>
        );
      })}
    </div>
  );
}
