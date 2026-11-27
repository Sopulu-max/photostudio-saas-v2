'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  daysOf, doubledIn, rangeOf, sayDoubled, saySpan, step, titleOf, weeksOf,
  type Entry, type View,
} from '@/weave/calendar/shape';
import { Month } from './Month';
import { Week } from './Week';
import { Day } from './Day';

const VIEWS: { view: View; says: string }[] = [
  { view: 'month', says: 'Month' },
  { view: 'week', says: 'Week' },
  { view: 'day', says: 'Day' },
];

/**
 * Three views over one fetch.
 *
 * SWITCHING A VIEW IS NOT A PAGE LOAD. It was: each view was a link, every
 * link a server navigation, and every navigation re-ran the whole calendar —
 * seven queries, measured at 700–900ms in parallel. Flicking between month
 * and week cost the best part of a second each way, which is what makes an
 * app feel like a website.
 *
 * The month, the week and the day of one anchor are all SUBSETS of the same
 * range: the month grid already reaches past its own edges to whole weeks, so
 * any week or day inside that month is inside what has already been fetched.
 * The page fetches that range once; this switches between readings of it with
 * no round trip at all.
 *
 * THE URL DOES NOT FOLLOW AN IN-RANGE SWITCH, and that was measured rather
 * than assumed. `history.replaceState` is patched by the router, so calling
 * it woke the server component and put a switch back up to two seconds —
 * every bit of what this was built to remove. An address bar that tracks the
 * current view is not worth two seconds a press. A link carrying `?v=` and
 * `?d=` still opens exactly where it says; it just stops narrating.
 *
 * STEPPING OUT OF THE RANGE IS A REAL NAVIGATION, and honestly so: the data
 * is not there, and pretending otherwise would draw an empty month.
 */
export function Calendar({ entries, from, to, view: initialView, anchor: initialAnchor, today }: {
  entries: Entry[];
  /** The span already fetched. Anything inside it needs no server. */
  from: string;
  to: string;
  view: View;
  anchor: string;
  today: string;
}) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [anchor, setAnchor] = useState(initialAnchor);

  const go = (nextView: View, nextAnchor: string) => {
    const want = rangeOf(nextView, nextAnchor);
    const have = want.from >= from && want.to <= to;

    if (!have) {
      router.push(`/calendar?v=${nextView}&d=${nextAnchor}`);
      return;
    }

    setView(nextView);
    setAnchor(nextAnchor);
  };

  /*
   * A month is counted by its own month, not by the grid: December told in
   * terms of a Tuesday in November would be the wrong reading.
   */
  const span = rangeOf(view, anchor);
  const counted = entries.filter((e) => (view === 'month'
    ? e.on.slice(0, 7) === anchor.slice(0, 7)
    : e.on >= span.from && e.on <= span.to));

  const named = titleOf(view, anchor);
  const doubled = sayDoubled(doubledIn(counted));

  return (
    <div className="q-page">
      <header className="q-page-header">
        <div className="q-cal-said">
          <h1 className="q-page-title">{named}</h1>
          <p className="q-page-subtitle">{saySpan(counted)}</p>
        </div>

        {/*
          * Two groups on one line, not six loose words on two.
          *
          * The view is a choice of one, so it takes the segmented control
          * this interface already uses for appearance: three options sharing
          * a border, the one in use filled. Moving is not a choice of one —
          * nothing is ever "on" — so it is its own group, and the arrows are
          * arrows because a calendar's back and forward are the most pressed
          * controls on the page and do not need a word each.
          *
          * THE CLUSTER DOES NOT MOVE. It sat in a wrapping row, and the title
          * beside it changes length with the view — "December 2026" against
          * "Sunday, 13 December 2026" — so a longer title squeezed the two
          * pills onto separate lines and shifted them sideways as somebody
          * clicked through. The controls hold their size and the title gives
          * way instead; a control that moves while being pressed is worse
          * than an ugly one.
          */}
        <div className="q-cal-controls">
          <div className="q-seg" role="group" aria-label="View">
            {VIEWS.map((one) => (
              <button
                key={one.view}
                type="button"
                onClick={() => go(one.view, anchor)}
                className={one.view === view ? 'q-seg-pick q-seg-on' : 'q-seg-pick'}
                aria-pressed={one.view === view}
              >
                {one.says}
              </button>
            ))}
          </div>

          <div className="q-seg" role="group" aria-label="Move">
            <button
              type="button" className="q-seg-pick q-seg-arrow"
              onClick={() => go(view, step(view, anchor, -1))}
              aria-label={`Previous ${view}`}
            >
              &lsaquo;
            </button>
            <button
              type="button" className="q-seg-pick"
              onClick={() => go(view, today)}
            >
              Today
            </button>
            <button
              type="button" className="q-seg-pick q-seg-arrow"
              onClick={() => go(view, step(view, anchor, 1))}
              aria-label={`Next ${view}`}
            >
              &rsaquo;
            </button>
          </div>
        </div>

      </header>

      {/* The one thing a span can tell a studio that a list cannot. */}
      {doubled && <p className="q-clash">{doubled}</p>}

      {view === 'month' && (
        <Month
          weeks={weeksOf(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1)}
          month={Number(anchor.slice(5, 7)) - 1}
          today={today}
          entries={entries}
        />
      )}

      {view === 'week' && (
        <Week days={daysOf(span.from, span.to)} today={today} entries={entries} />
      )}

      {view === 'day' && <Day day={anchor} entries={entries} />}
    </div>
  );
}
