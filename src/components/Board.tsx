'use client';

import React from 'react';
import Link from 'next/link';
import type { LensGroup, Takes } from '@/kernel/lenses';

/**
 * THE BOARD - where everything sits, read at a glance.
 *
 * The page's other readings are sentences, and a sentence is read one at a
 * time. This is the one reading that is SPATIAL: a column per value of an
 * axis, a card per job in it, so the column's height IS how much of the book
 * sits there, a card's position IS its membership, and an empty column IS a
 * value nothing is at. Nothing here needs a key, because every column is
 * headed by the studio's own word and its count.
 *
 * THE AXIS IS CHOSEN, NEVER DECLARED. A board by stage says stage is the
 * hierarchy, which it is not (11-BOOKINGS_INFORMATION_ARCHITECTURE §4: across
 * bookings there is no stored hierarchy, only groupings by a shared value, and
 * they are equal). So the columns come from whichever axis the operator picks -
 * the same axes the instrument groups by, read off the data: the studio's
 * stages, the bands of its calendar, the roles its steps need, the absences,
 * every dimension it classifies by. Pick another and the page regroups.
 *
 * A CARD IS A FIXED SHAPE, so twenty of them scan as a set: who it is for,
 * what it is, when it is, and the one thing it needs. Everything on it arrives
 * decided (modules/bookings/say).
 */

export type BoardCard = {
  id: string;
  takes: Takes;
  /** Who the booking is for, or its own title when no client is recorded. */
  name: string;
  /** What it is - the packages, or what the studio typed instead. */
  what: string | null;
  /** When it is, in words: "Saturday 26 September, in 4 days" · "no date yet". */
  when: string;
  /** Whether that when is behind now. */
  behind: boolean;
  /** A session dated today. */
  now: boolean;
  /** The one unresolved item on this booking - absent when the record is complete. */
  needs: string | null;
  /** How far its work has gone, when it has any. */
  work: { done: number; total: number } | null;
};

const share = (n: number) => ({ '--q-share': n } as React.CSSProperties);
const NONE = '__none__';

export function Board({
  axis,
  cards,
  axes,
  onCard,
  onColumn,
  max = 7,
}: {
  axis: LensGroup;
  cards: BoardCard[];
  /**
   * The axes this board can be read by - the operator's choice. Choosing one
   * regroups the cards in the browser: the same rows, a different question, no
   * navigation.
   */
  axes: { key: string; label: string; on: boolean; act: () => void }[];
  /** A card opens its booking, which IS a navigation - a different page. */
  onCard: (id: string) => string;
  /** A column head narrows the cut to that column, in place. */
  onColumn: (itemKey: string) => void;
  max?: number;
}) {
  const columns = [
    ...axis.items.map((it) => ({ key: it.key, label: it.label, count: it.count, color: it.look?.color ?? null, now: Boolean(it.now), note: it.note ?? null })),
    ...(axis.none ? [{ key: NONE, label: axis.none, count: cards.filter((c) => (c.takes[axis.key] ?? []).length === 0).length, color: null, now: false, note: null }] : []),
  ].filter((c) => c.count > 0);

  const tallest = Math.max(1, ...columns.map((c) => c.count));
  const inColumn = (key: string) =>
    key === NONE
      ? cards.filter((c) => (c.takes[axis.key] ?? []).length === 0)
      : cards.filter((c) => (c.takes[axis.key] ?? []).includes(key));

  return (
    <div className="q-board">
      <div className="q-board-by">
        <span className="q-board-by-word">Grouped by</span>
        {axes.map((a) => (
          <button key={a.key} type="button" onClick={a.act}
                  className={a.on ? 'q-board-by-axis q-board-by-on' : 'q-board-by-axis'}>{a.label}</button>
        ))}
      </div>

      <div className="q-board-cols">
        {columns.map((col) => {
          const rows = inColumn(col.key);
          const shown = rows.slice(0, max);
          return (
            <section key={col.key} className={col.now ? 'q-board-col q-board-col-now' : 'q-board-col'}>
              <button type="button" onClick={() => onColumn(col.key)} className="q-board-head">
                <span className="q-board-head-top">
                  {col.color && <i className={`q-board-dot q-dist-c-${col.color}`} />}
                  <span className="q-board-word">{col.label}</span>
                  <b className="q-board-n">{col.count}</b>
                </span>
                {/* The column's share of the book, so height is not the only reading. */}
                <span className="q-board-weight"><i style={share(Math.round((col.count / tallest) * 100))} /></span>
                {col.note && <span className="q-board-note">{col.note}</span>}
              </button>

              <div className="q-board-stack">
                {shown.map((c) => (
                  <Link key={c.id} href={onCard(c.id)} className={['q-card', c.now ? 'q-card-now' : '', c.needs ? 'q-card-needs' : ''].filter(Boolean).join(' ')}>
                    <span className="q-card-name">{c.name}</span>
                    {c.what && <span className="q-card-what">{c.what}</span>}
                    <span className={c.behind ? 'q-card-when q-card-behind' : 'q-card-when'}>{c.when}</span>
                    {c.needs && <span className="q-card-needs-said">{c.needs}</span>}
                    {c.work && c.work.total > 0 && (
                      <span className="q-card-work" title={`${c.work.done} of ${c.work.total} steps done`}>
                        <span className="q-card-work-track"><i className={c.work.done === c.work.total ? 'q-card-work-fill q-card-work-done' : 'q-card-work-fill'} style={share(Math.round((c.work.done / c.work.total) * 100))} /></span>
                        <span className="q-card-work-said">{c.work.done} of {c.work.total} steps</span>
                      </span>
                    )}
                  </Link>
                ))}
                {rows.length > shown.length && (
                  <button type="button" onClick={() => onColumn(col.key)} className="q-board-more">
                    {rows.length - shown.length} more here →
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
