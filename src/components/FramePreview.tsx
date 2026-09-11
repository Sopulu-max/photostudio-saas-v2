'use client';

import React from 'react';
import { parseSize, describeSize } from '@/modules/services/sizes';

/**
 * A picture seen in the frame it will fill, at the size that was chosen.
 *
 * Pure derivation: a size the client picked, a picture they handed over, and
 * nothing stored. The frame is drawn at the size's true proportion, scaled so
 * the longer edge fills `max`; the mat and moulding are fixed fractions of it,
 * which is roughly how a real framer works and is why a small print reads as
 * a small frame rather than as a large frame with a thin border.
 *
 * NO GUESSING FROM WORDS. A frame finish the studio named 'Black' or 'Natural
 * wood' is a choice the client makes; it is not read here, because reading a
 * colour out of a studio's option name is the inference this app forbids. One
 * neutral moulding, always. When the engine owns a colour shape, the frame
 * can wear it.
 */
export function FramePreview({
  size,
  unit,
  imageUrl,
  imageName,
  max = 300,
}: {
  /** The chosen size, in the engine's spelling — '16×20'. */
  size: string;
  unit?: string | null;
  imageUrl?: string | null;
  imageName?: string | null;
  max?: number;
}) {
  const parsed = parseSize(size);
  if (!parsed) return null;

  const longest = Math.max(parsed.width, parsed.height);
  const scale = max / longest;
  const w = Math.round(parsed.width * scale);
  const h = Math.round(parsed.height * scale);

  return (
    <figure className="q-frame-stage" style={{ margin: 0 }}>
      <div
        className="q-frame"
        style={{ '--q-w': `${w}px`, '--q-h': `${h}px` } as unknown as React.CSSProperties}
      >
        <div className="q-frame-mat">
          {imageUrl ? (
            <img className="q-frame-photo" src={imageUrl} alt={imageName || 'Your picture'} />
          ) : (
            <div className="q-frame-photo-empty">Your picture, once you add one</div>
          )}
        </div>
      </div>
      <figcaption className="q-frame-caption">
        <strong>{describeSize(size, unit)}</strong>
        {imageName ? ` · ${imageName}` : ''}
      </figcaption>
    </figure>
  );
}
