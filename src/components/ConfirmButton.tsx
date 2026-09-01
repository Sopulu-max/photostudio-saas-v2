'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * A destructive action that asks once, in place.
 *
 * WHAT IT REPLACES. Six places called window.confirm — the last blocking modal
 * in an app that otherwise answers every action with a toast. An OS dialog
 * stops the page, ignores the theme, cannot be styled, lands in the middle of
 * the screen away from the thing it is about, and on some browsers announces
 * itself as "localhost:3000 says". It is also the one control here that a
 * studio cannot read in its own product's voice.
 *
 * ASKING IN PLACE INSTEAD. The button arms on the first press and does the
 * thing on the second, so the question is asked exactly where the answer is
 * given — the same reason the package cards say "on this booking" at the card
 * and the studio's hours are read out beside the date being chosen.
 *
 * IT DISARMS ITSELF, three ways: after a few seconds, when focus leaves, and
 * when Escape is pressed. An armed button left sitting on a page is a trap for
 * the next click, and a confirmation that outlives the intent behind it is no
 * confirmation at all.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Sure?',
  className = 'q-btn-ghost q-btn-xs',
  title,
  disabled,
  /** How long an armed button waits before deciding nobody meant it. */
  armedMs = 4000,
}: {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
  className?: string;
  title?: string;
  disabled?: boolean;
  armedMs?: number;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = () => {
    setArmed(false);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <button
      type="button"
      className={armed ? `${className} q-confirming` : className}
      title={armed ? 'Press again to confirm' : title}
      disabled={disabled}
      /*
       * The armed state is the button's own, so it is announced when it
       * changes rather than left for the eye alone. aria-live on the element
       * would re-read the label on every render; this says what it is.
       */
      aria-label={armed ? `${confirmLabel} — press again to confirm` : undefined}
      onBlur={disarm}
      onKeyDown={(e) => { if (e.key === 'Escape') disarm(); }}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), armedMs);
          return;
        }
        disarm();
        onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
