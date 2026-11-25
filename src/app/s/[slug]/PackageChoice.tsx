'use client';

import { useState } from 'react';
import { sayPackage, type Package } from '@/weave/packages/shape';
import type { PackageMedia } from '@/weave/packages/media';
import { money } from '@/weave/store/shape';

/**
 * Choosing what to book, by looking at it.
 *
 * This was a `<select>`: a package — the thing a studio spends its life
 * making look good — reduced to a line of text in a dropdown. In an industry
 * where the work IS the argument, that was the single worst screen in the
 * app.
 *
 * Radios under the cards, so the keyboard, the screen reader and the form
 * submission all behave the way they already did. The card is the label; the
 * input is what the browser needs.
 */
export function PackageChoice({ packages, media, name }: {
  packages: Package[];
  media: PackageMedia[];
  /** The form field the chosen package is submitted under. */
  name: string;
}) {
  const [chosen, setChosen] = useState('');

  if (packages.length === 0) return null;

  return (
    <fieldset className="q-choice">
      <legend className="q-label">Package</legend>

      <div className="q-choice-grid">
        {packages.map((p) => {
          const shots = media.filter((m) => m.packageId === p.id);
          const cover = shots[0] ?? null;
          const on = chosen === p.id;

          return (
            <label key={p.id} className={on ? 'q-offer q-offer-on' : 'q-offer'}>
              <input
                type="radio" name={name} value={p.id} className="q-offer-radio"
                checked={on} onChange={() => setChosen(p.id)}
              />

              <span className="q-offer-art">
                {cover ? (
                  cover.kind === 'video' ? (
                    /* Muted, looping and silent: a moving cover is a
                     * showreel, not something that starts talking at a
                     * stranger who has just opened the page. */
                    <video
                      className="q-offer-frame" src={cover.url}
                      muted loop playsInline autoPlay preload="metadata"
                    />
                  ) : (
                    <img className="q-offer-frame" src={cover.url} alt="" />
                  )
                ) : (
                  <span className="q-offer-bare">No pictures yet</span>
                )}

                {/* How much more there is to see, where a client can see it. */}
                {shots.length > 1 && (
                  <span className="q-offer-more">{shots.length}</span>
                )}
              </span>

              <span className="q-offer-says">
                <strong className="q-offer-name">{p.name}</strong>
                <span className="q-meta-sm">{sayPackage(p)}</span>
                {p.about && <span className="q-meta-sm">{p.about}</span>}
                <span className="q-offer-price">
                  {p.price === null ? 'Price on request' : money(p.price, p.currency)}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {/*
        * Asking without choosing is allowed. A client who does not know what
        * they want yet is exactly the client a studio most wants to hear
        * from, and a required field would turn them away.
        */}
      <label className={chosen === '' ? 'q-offer-none q-offer-on' : 'q-offer-none'}>
        <input
          type="radio" name={name} value="" className="q-offer-radio"
          checked={chosen === ''} onChange={() => setChosen('')}
        />
        Not sure yet
      </label>
    </fieldset>
  );
}
