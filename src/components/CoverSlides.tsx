'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

export type CoverSlide = { url: string; position: string | null };

/**
 * A cover that is more than one picture.
 *
 * A CROSSFADE, NOT A CAROUSEL. Every slide is stacked in the same frame and
 * only opacity moves, so nothing slides in from anywhere and the frame never
 * changes size. A cover sits at the top of a page and inside a card in a grid;
 * anything that moved horizontally would be a second motion language arguing
 * with the one the rest of the app settles by.
 *
 * IT STOPS WHEN NOBODY IS LOOKING. Off-screen it does not run, because a
 * catalogue of a dozen packages would otherwise be a dozen timers and a dozen
 * repaints for pictures nobody has scrolled to. Hidden tabs stop it too.
 *
 * IT NEVER RUNS ON ITS OWN WHERE MOTION IS UNWELCOME. prefers-reduced-motion
 * pins it to the first picture — the cover, which is exactly what this was
 * before it could hold more than one. That is a real fallback rather than a
 * degraded one.
 *
 * IT PLAYS WHEREVER IT IS DRAWN. Cards included — but each card starts on
 * its own beat, so a grid drifts out of step instead of flipping in unison,
 * and the observer means a card that has not been scrolled to costs nothing.
 * Where `auto` is off it plays only under the pointer, a little faster,
 * because a hand on it is a question.
 *
 * ONE PICTURE IS THE NORMAL CASE. With a single slide there is no timer, no
 * dots and no observer: it renders as the plain cover it always was, so nothing
 * about a package that has one photograph got heavier.
 */
export function CoverSlides({
  slides,
  className,
  /** Milliseconds each picture holds. The fade itself is --q-dur-3. */
  hold = 4200,
  /** Where it plays by itself, rather than only when pointed at. */
  auto = true,
  /**
   * Milliseconds before this one's FIRST change. A grid of cards that all
   * fade on the same beat reads as a machine; given each a different start
   * they drift out of step and read as a wall of prints, each on its own time.
   */
  offset = 0,
  children,
}: {
  slides: CoverSlide[];
  className?: string;
  hold?: number;
  auto?: boolean;
  offset?: number;
  children?: React.ReactNode;
}) {
  const [at, setAt] = useState(0);
  const [live, setLive] = useState(false);
  const [held, setHeld] = useState(false);
  const frame = useRef<HTMLDivElement | null>(null);

  const many = slides.length > 1;

  /*
   * Only while it is on screen.
   *
   * The observer is the whole reason a catalogue can afford this: a card that
   * has not been scrolled to costs nothing at all.
   */
  useEffect(() => {
    const el = frame.current;
    if (!el || !many || !auto) return;

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (calm.matches) return;

    const watch = new IntersectionObserver(
      ([entry]) => setLive(entry.isIntersecting),
      { threshold: 0.25 },
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, [many, auto]);

  /*
   * Playing, for one of two reasons: it plays by itself and is on screen, or it
   * does not and somebody is pointing at it. The second is how a grid of cards
   * stays still until one of them is interesting — and then that one moves,
   * faster than a hero would, because a hand on it is a question.
   */
  const playing = many && (auto ? live : held);
  const pace = auto ? hold : Math.min(hold, 1600);

  useEffect(() => {
    if (!playing) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (calm.matches) return;
    const step = () => setAt((i) => (i + 1) % slides.length);
    // The first change waits its offset; every one after keeps the beat.
    let tick: ReturnType<typeof setInterval> | null = null;
    const first = setTimeout(() => { step(); tick = setInterval(step, pace); }, pace + offset);
    return () => { clearTimeout(first); if (tick) clearInterval(tick); };
  }, [playing, slides.length, pace, offset]);

  const enter = useCallback(() => setHeld(true), []);
  const leave = useCallback(() => setHeld(false), []);

  if (slides.length === 0) return <>{children}</>;

  return (
    <div
      ref={frame}
      className={className ? `q-slides ${className}` : 'q-slides'}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      {slides.map((slide, i) => (
        <span
          key={slide.url}
          className={i === at ? 'q-slide q-slide-on' : 'q-slide'}
          style={{
            /* The picture and its own framing — data, not a design decision. */
            backgroundImage: `url(${slide.url})`,
            backgroundPosition: slide.position || undefined,
          }}
          aria-hidden="true"
        />
      ))}

      {many && (
        <span className="q-slide-pips" aria-hidden="true">
          {slides.map((slide, i) => (
            <span key={slide.url} className={i === at ? 'q-slide-pip q-slide-pip-on' : 'q-slide-pip'} />
          ))}
        </span>
      )}

      {children}
    </div>
  );
}
