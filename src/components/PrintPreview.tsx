'use client';

import type { ShownAs, Size } from '@/weave/store/shape';

/**
 * The picture as the thing being bought, before it is bought.
 *
 * Two honest claims and no more. First, the CROP: a 3:2 photograph does not
 * fit an 8×10, and something leaves the picture. Showing which part survives
 * is the part that earns money — it is the difference between a sale and a
 * refund with somebody's head cut off. Second, the SCALE: every size is drawn
 * against the same wall at the same millimetres-per-pixel, so a 20×30 looks
 * like what it is next to an 8×10, which is why people buy the bigger one.
 *
 * `object-fit: cover` does the crop, centred, exactly as a lab would trim to
 * the short edge. If the studio later lets a client drag the crop, the offset
 * lands on `object-position` and nothing else here changes.
 */

/** One wall, one scale, so sizes are comparable rather than merely drawn. */
const MM_PER_PX = 1.9;
const WALL_H = 290;

export function PrintPreview({
  url, name, size, shownAs,
}: {
  url: string | null;
  name: string;
  size: Size | null;
  shownAs: ShownAs;
}) {
  // Without measurements there is nothing truthful to draw, so it says so
  // rather than inventing a rectangle.
  if (!size) {
    return (
      <div className="q-pv q-pv-unknown">
        <p className="q-meta">This one has no size set, so it cannot be shown on a wall.</p>
      </div>
    );
  }

  const w = size.widthMm / MM_PER_PX;
  const h = size.heightMm / MM_PER_PX;

  // The mat and moulding are drawn in proportion to the print, not fixed, so a
  // small frame does not wear a border meant for a large one.
  const mat = shownAs === 'framed' ? Math.max(10, Math.min(w, h) * 0.09) : 0;
  const moulding = shownAs === 'framed' ? Math.max(7, Math.min(w, h) * 0.045) : 0;

  /*
   * The measurements are data, so they arrive as custom properties and every
   * rule that uses them lives in globals.css. Writing width and padding inline
   * would put this component's look in two places; a token cannot.
   */
  const measured = {
    ['--q-pv-w' as string]: `${w}px`,
    ['--q-pv-h' as string]: `${h}px`,
    ['--q-pv-mat' as string]: `${mat}px`,
    ['--q-pv-moulding' as string]: `${moulding}px`,
    ['--q-pv-wall' as string]: `${WALL_H}px`,
  };

  return (
    <div className="q-pv" style={measured}>
      <div className="q-pv-wall" aria-hidden="true" />

      <div className={`q-pv-piece q-pv-${shownAs}`}>
        <div className="q-pv-mat">
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="q-pv-img" src={url} alt={`${name}, as it will be printed`} />
          ) : (
            <div className="q-pv-img q-pv-missing" />
          )}
        </div>
      </div>
    </div>
  );
}
