'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * WHICH ROWS ARE NEW SINCE A MOMENT AGO.
 *
 * The other half of "confirm what you cannot see, flash what you can". A toast
 * is for a result with nothing on screen to show for it; a row that has just
 * appeared in a list you are already looking at needs no sentence, it needs the
 * eye taken to it. On a list long enough to scroll, "it worked" and "where did
 * it go" are the same question.
 *
 * DERIVED, NOT DECLARED. It compares the ids it is given against the ids it saw
 * last, so nothing has to report what it created: an action can add a row, the
 * server can revalidate, and the arrival is noticed on the way past. That
 * matters because most of these lists are refreshed with router.refresh() and
 * never learn the id of the thing they just made.
 *
 * Nothing is new on the first render — a page that has just loaded is not a
 * list of arrivals, and flashing every row on arrival at the page would train
 * the eye to ignore the one flash that means something.
 */
export function useArrivals(ids: string[], settleMs = 1300): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const key = ids.join('\u0000');

  useEffect(() => {
    const now = key === '' ? [] : key.split('\u0000');

    if (seen.current === null) {
      seen.current = new Set(now);
      return;
    }

    const added = now.filter((id) => !seen.current!.has(id));
    seen.current = new Set(now);
    if (added.length === 0) return;

    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), settleMs);
    return () => clearTimeout(t);
  }, [key, settleMs]);

  return fresh;
}
