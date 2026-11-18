'use client';

import { useState } from 'react';
import {
  money, saySize, sizeOf,
  type Product, type ProductVariant, type RoomScene, type Size,
} from '@/weave/store/shape';

/**
 * The picture on a real wall, in a real room, at its real size.
 *
 * The composite is a plain rectangle because the scenes are photographed
 * square-on — checked against a working Pic-Time configurator, where the lens
 * is parallel to the wall. No perspective, no homography. The convincing part
 * was never the maths; it is that the room is a photograph.
 *
 * Where this goes further: changing the size does not reload a picture of a
 * different product, it RESIZES THE PRINT IN THE ROOM. You watch an 8×10
 * become a 20×30 against the same sofa, which is the comparison the client is
 * actually making and the reason they buy the bigger one.
 */

type Choice = {
  key: string;
  product: Product;
  variant: ProductVariant | null;
  size: Size;
  price: number;
};

export function RoomView({
  photoUrl, scenes, products, currency, onAdd, working,
}: {
  photoUrl: string | null;
  scenes: RoomScene[];
  products: Product[];
  currency: string;
  onAdd: (productId: string, variantId: string | null) => void;
  working?: boolean;
}) {
  const choices: Choice[] = [];
  for (const product of products) {
    const options: (ProductVariant | null)[] = product.variants.length ? product.variants : [null];
    for (const variant of options) {
      const size = sizeOf(product, variant);
      if (!size) continue;
      choices.push({
        key: `${product.id}:${variant?.id ?? 'base'}`,
        product, variant, size,
        price: product.price + (variant?.priceDelta ?? 0),
      });
    }
  }
  choices.sort((a, b) => a.size.widthMm * a.size.heightMm - b.size.widthMm * b.size.heightMm);

  const hangable = scenes.filter((s) => s.url);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [choiceKey, setChoiceKey] = useState<string | null>(null);

  if (choices.length === 0 || hangable.length === 0) return null;

  const scene = hangable.find((s) => s.id === sceneId) ?? hangable[0];
  const chosen = choices.find((c) => c.key === choiceKey) ?? choices[Math.floor(choices.length / 2)];

  /*
   * The print's width as a fraction of the photograph. A 508mm print on a
   * 2600mm wall is 19.5% of the image, whatever size that image is rendered
   * at — so the scale stays true on a phone and on a desktop alike.
   */
  const across = scene.hangs ? (chosen.size.widthMm / scene.hangs.wallMm) : 0;
  const ratio = chosen.size.heightMm / chosen.size.widthMm;

  return (
    <div className="q-room">
      <div className="q-room-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="q-room-photo" src={scene.url ?? undefined} alt={scene.name} />

        {scene.hangs && (
          <div
            /* `q-room-as-` prefixed: a bare `q-room-${shownAs}` collides with
               the image's own `q-room-print` class and the image's width:100%
               lands on the frame. */
            className={`q-room-hung q-room-as-${chosen.product.shownAs}`}
            style={{
              ['--q-room-across' as string]: `${across * 100}%`,
              ['--q-room-ratio' as string]: String(ratio),
              ['--q-room-x' as string]: `${scene.hangs.x * 100}%`,
              ['--q-room-y' as string]: `${scene.hangs.y * 100}%`,
            }}
          >
            {photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img className="q-room-print" src={photoUrl} alt="" />
            ) : <span className="q-room-print q-room-blank" />}
          </div>
        )}
      </div>

      {hangable.length > 1 && (
        <div className="q-room-scenes">
          {hangable.map((s) => (
            <button
              type="button" key={s.id}
              className={s.id === scene.id ? 'q-room-thumb q-room-thumb-on' : 'q-room-thumb'}
              onClick={() => setSceneId(s.id)}
              aria-label={s.name}
              aria-pressed={s.id === scene.id}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url ?? undefined} alt="" />
            </button>
          ))}
        </div>
      )}

      {/*
        * Sizes as a row rather than a dropdown. A dropdown hides the range,
        * and the range is the thing being decided — pressing along it makes
        * the print grow on the wall, which a select never shows you.
        */}
      <div className="q-room-sizes">
        {choices.map((c) => (
          <button
            type="button" key={c.key}
            className={c.key === chosen.key ? 'q-size q-size-on' : 'q-size'}
            onClick={() => setChoiceKey(c.key)}
            aria-pressed={c.key === chosen.key}
          >
            {c.size.widthMm} × {c.size.heightMm}
          </button>
        ))}
      </div>

      <div className="q-room-say">
        <span className="q-room-what">
          <strong className="q-strong">{chosen.product.name}</strong>
          <span className="q-meta">
            {chosen.variant ? `${chosen.variant.name} · ` : ''}{saySize(chosen.size)}
          </span>
        </span>
        <span className="q-row q-row-sm">
          <strong className="q-num">{money(chosen.price, currency)}</strong>
          <button
            type="button" className="q-btn q-btn-primary q-btn-sm" disabled={working}
            onClick={() => onAdd(chosen.product.id, chosen.variant?.id ?? null)}
          >
            Add this one
          </button>
        </span>
      </div>
    </div>
  );
}
