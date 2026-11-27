'use client';

import { useState, type ReactNode } from 'react';

/**
 * A quiet button that becomes a form when it is pressed.
 *
 * The board taught the quietness: a page whose every row carries an open form
 * reads as setup, not as what is true. Adding a product, writing a follow-up,
 * minting a code — all of it is occasional, and occasional work should not be
 * the loudest thing on a page somebody opens twenty times a day.
 *
 * IT WAS A FAINT MONO LINE, which went too far. In the same tracked grey as
 * every section label on the page, the one thing that could be pressed was
 * indistinguishable from the headings around it — and "Add team member" sat
 * on the team page as a label while the identical words sat on a booking as a
 * button. A secondary button is quiet without pretending not to be a control.
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
        className={align === 'end'
          ? 'q-btn q-btn-secondary q-btn-sm q-reveal-end'
          : 'q-btn q-btn-secondary q-btn-sm q-start-btn'}
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
