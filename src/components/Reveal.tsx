'use client';

import { useState, type ReactNode } from 'react';

/**
 * A quiet line that becomes a form when it is reached for.
 *
 * The board taught this: a page whose every row carries an open form reads as
 * setup, not as what is true. Adding a product, writing a follow-up, minting a
 * code — all of it is occasional, and occasional work should not be the loudest
 * thing on a page somebody opens twenty times a day.
 *
 * It lives here rather than in each screen because it is one behaviour, and a
 * behaviour copied five times is five behaviours the next change has to find.
 */
export function Reveal({
  says, children, align = 'start',
}: {
  /** What the closed line offers, in the studio's own words. */
  says: string;
  /** Given a way to close, so a form can shut itself after it succeeds. */
  children: (done: () => void) => ReactNode;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className={align === 'end' ? 'q-reveal-line q-reveal-end' : 'q-reveal-line'}
        onClick={() => setOpen(true)}
      >
        {says}
      </button>
    );
  }

  return (
    <div className="q-reveal">
      {children(() => setOpen(false))}
      <button type="button" className="q-btn q-btn-ghost q-btn-xs" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
