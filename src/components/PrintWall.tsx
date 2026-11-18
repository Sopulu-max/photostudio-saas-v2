'use client';

import { useState } from 'react';
import { money, saySize, sizeOf, type Product, type ProductVariant, type Size } from '@/weave/store/shape';

/**
 * One wall, every size, at once.
 *
 * A client is not asking "what does an 8×10 look like" — they are asking HOW
 * BIG SHOULD THIS BE. Showing one product at a time makes them hold the
 * comparison in their head, which is the hard part of the decision and the
 * part an interface should be doing. So every size the studio sells hangs on
 * the same wall, at true relative scale, with the photograph live in all of
 * them. You choose by looking.
 *
 * The sideboard is not decoration. 762mm is not a quantity anybody feels; a
 * print that reaches two-thirds of the way across a sideboard is. It is drawn
 * at real dimensions in the same scale as the prints, so the comparison is
 * honest rather than suggestive.
 */

/** Real millimetres, so the reference is a reference and not a doodle. */
const SIDEBOARD_W = 1400;
const SIDEBOARD_H = 760;
const ABOVE_SIDEBOARD = 260;
const GAP_MM = 150;

/** What the drawing has to fit inside. */
const MAX_W = 600;
const MAX_H = 330;

type Piece = {
  key: string;
  product: Product;
  variant: ProductVariant | null;
  size: Size;
  price: number;
};

export function PrintWall({
  url, fileName, products, currency, onAdd, working,
}: {
  url: string | null;
  fileName: string;
  products: Product[];
  currency: string;
  onAdd: (productId: string, variantId: string | null) => void;
  working?: boolean;
}) {
  const pieces: Piece[] = [];
  for (const product of products) {
    const options: (ProductVariant | null)[] = product.variants.length ? product.variants : [null];
    for (const variant of options) {
      const size = sizeOf(product, variant);
      if (!size) continue;
      pieces.push({
        key: `${product.id}:${variant?.id ?? 'base'}`,
        product, variant, size,
        price: product.price + (variant?.priceDelta ?? 0),
      });
    }
  }

  // Smallest first, so the eye travels up through the sizes the way the
  // decision does.
  pieces.sort((a, b) => a.size.widthMm * a.size.heightMm - b.size.widthMm * b.size.heightMm);

  const [chosen, setChosen] = useState<string | null>(null);
  if (pieces.length === 0) return null;

  const picked = pieces.find((p) => p.key === chosen) ?? null;

  /*
   * One scale for everything on the wall, chosen so the whole arrangement
   * fits. Both constraints matter: a row of wide prints runs out of width, a
   * single tall one runs out of height, and either overflowing would make the
   * relative sizes a lie.
   */
  const totalMmWide = pieces.reduce((n, p) => n + p.size.widthMm, 0)
    + GAP_MM * (pieces.length - 1);
  const tallestMm = Math.max(...pieces.map((p) => p.size.heightMm));
  const stackMm = SIDEBOARD_H + ABOVE_SIDEBOARD + tallestMm;
  const scale = Math.min(MAX_W / Math.max(totalMmWide, SIDEBOARD_W), MAX_H / stackMm);
  const px = (mm: number) => `${mm * scale}px`;

  return (
    <div className="q-wall">
      <div
        className="q-wall-room"
        style={{
          ['--q-wall-h' as string]: px(stackMm),
          ['--q-wall-gap' as string]: px(GAP_MM),
          ['--q-wall-floor' as string]: px(SIDEBOARD_H),
          ['--q-wall-tallest' as string]: px(tallestMm),
        }}
      >
        <div className="q-wall-hang">
          {pieces.map((piece) => {
            const framed = piece.product.shownAs === 'framed';
            const mat = framed ? Math.max(8, Math.min(piece.size.widthMm, piece.size.heightMm) * 0.085 * scale) : 0;
            const moulding = framed ? Math.max(5, Math.min(piece.size.widthMm, piece.size.heightMm) * 0.04 * scale) : 0;
            const on = picked?.key === piece.key;

            return (
              <button
                type="button"
                key={piece.key}
                className={on ? 'q-hang q-hang-on' : 'q-hang'}
                aria-pressed={on}
                aria-label={`${piece.product.name}, ${saySize(piece.size)}`}
                onClick={() => setChosen(on ? null : piece.key)}
                style={{
                  ['--q-p-w' as string]: px(piece.size.widthMm),
                  ['--q-p-h' as string]: px(piece.size.heightMm),
                  ['--q-p-mat' as string]: `${mat}px`,
                  ['--q-p-moulding' as string]: `${moulding}px`,
                }}
              >
                <span className={`q-hang-piece q-hang-${piece.product.shownAs}`}>
                  <span className="q-hang-mat">
                    {url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img className="q-hang-img" src={url} alt="" />
                    ) : <span className="q-hang-img q-hang-blank" />}
                  </span>
                </span>
                <span className="q-hang-size">{piece.size.widthMm} × {piece.size.heightMm}</span>
              </button>
            );
          })}
        </div>

        {/* Real dimensions, same scale. The thing that makes a number a size. */}
        <div
          className="q-wall-side"
          style={{ ['--q-side-w' as string]: px(SIDEBOARD_W), ['--q-side-h' as string]: px(SIDEBOARD_H) }}
          aria-hidden="true"
        >
          <span className="q-wall-side-top" />
          <span className="q-wall-side-leg" />
          <span className="q-wall-side-leg" />
        </div>
      </div>

      <div className="q-wall-say">
        {picked ? (
          <>
            <span className="q-wall-chosen">
              <strong className="q-strong">{picked.product.name}</strong>
              <span className="q-meta">
                {picked.variant ? `${picked.variant.name} · ` : ''}{saySize(picked.size)}
              </span>
            </span>
            <span className="q-row q-row-sm">
              <strong className="q-num">{money(picked.price, currency)}</strong>
              <button
                type="button" className="q-btn q-btn-primary q-btn-sm" disabled={working}
                onClick={() => onAdd(picked.product.id, picked.variant?.id ?? null)}
              >
                Add this one
              </button>
            </span>
          </>
        ) : (
          <span className="q-meta">
            {pieces.length} sizes of {fileName}, shown against a sideboard. Press one.
          </span>
        )}
      </div>
    </div>
  );
}
