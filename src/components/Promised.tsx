import { slotSize } from '@/weave/packages/shape';

/**
 * What was promised, drawn as containers.
 *
 * From the studio's own sketch: a package detail page is a cover, and under
 * it a grid of small squares — one per picture the package promises. Four
 * promised, four squares. The promise stops being a sentence and becomes a
 * shape you can count.
 *
 * NO ROWS BEHIND THIS. The promise is still a single number in the database;
 * materialising four hundred empty records would be fabricating structure,
 * and they would disagree with the package the first time one changed. This
 * is a rendering OF that number — which is why the argument against storing
 * them was never an argument against showing them.
 *
 * SPACE FOR MORE, because the studio said so: the promise is a floor, not a
 * ceiling. The dashed slot at the end is not decoration — past the promise is
 * the same gallery past the line, and the store already prices an extra
 * picture.
 */
export function Promised({ promised, have = 0, extra = true }: {
  promised: number;
  /** How many have actually arrived. Zero on an offer — nothing is made yet. */
  have?: number;
  /** Whether more may be added beyond the promise. */
  extra?: boolean;
}) {
  if (promised <= 0) return null;

  const size = slotSize(promised);
  /* Over-delivery is not an error: it is the studio giving more, or the
   * client buying it. Shown as the promise, filled, plus what is beyond. */
  const filled = Math.min(have, promised);
  const beyond = Math.max(0, have - promised);

  return (
    <div className={`q-slots q-slots-${size}`} aria-hidden="true">
      {Array.from({ length: promised }, (_, i) => (
        <span key={i} className={i < filled ? 'q-slot q-slot-full' : 'q-slot'} />
      ))}
      {Array.from({ length: beyond }, (_, i) => (
        <span key={`over-${i}`} className="q-slot q-slot-over" />
      ))}
      {extra && beyond === 0 && <span className="q-slot q-slot-more" />}
    </div>
  );
}
