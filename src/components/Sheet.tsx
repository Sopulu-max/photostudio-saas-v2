import React from 'react';
import Link from 'next/link';

/**
 * THE SHEET.                                                     (D1, D4, D7)
 *
 * One list component for the whole app, in two views. A screen that lists is
 * a sheet: rows, a frame each, scanned. The same list tiled is the Cards
 * view, for a wide screen. Every list page describes its items in one shape
 * and this draws them; the Law of Centralization applied to markup rather
 * than only to style, so twelve lists are one implementation and a fix here
 * is a fix everywhere.
 *
 * WHAT AN ITEM SAYS. A name; a caption of at most a few facts that tell it
 * from its neighbours; a frame - a photograph, or initials, or an icon, but
 * always a frame, because a column of frames that sometimes goes missing is
 * not a column (D4); a figure, in ink unless it needs the operator (D3); a
 * badge for a genuine status; and optionally an action that sits above the
 * row's face, since an <a> inside an <a> is not markup.
 *
 * Server-renderable: no state here. The Cards/List choice arrives as `dense`
 * from whoever holds the toggle - CatalogFilter, on every list page.
 */

export type SheetFrame =
  | { url: string | null | undefined; initials?: string; icon?: React.ReactNode }
  | { initials: string }
  | { icon: React.ReactNode };

export type SheetFigure = {
  text: string;
  /** Needs the operator - takes the one warm colour on the sheet (D3). */
  due?: boolean;
  /** An absence, said quietly. */
  none?: boolean;
};

export type SheetItem = {
  id: string;
  href: string;
  name: string;
  /** Joined with a middle dot. Empty means `absent` is shown instead. */
  caption?: (string | null | undefined | false)[] | string | null;
  /** What to say when there is nothing to say - names only what is missing. */
  absent?: string;
  frame: SheetFrame;
  figure?: SheetFigure | null;
  badge?: React.ReactNode;
  /** A control that acts on the item, drawn above the face. */
  action?: React.ReactNode;
  /** Withdrawn, archived, retired: present and quiet. */
  dim?: boolean;
};

/* The same reading ContactAvatar makes of a person: two letters, or one. */
export function initialsFor(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

function captionText(item: SheetItem): string | null {
  const c = item.caption;
  if (!c) return null;
  if (typeof c === 'string') return c || null;
  const parts = c.filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : null;
}

function Frame({ frame, tile }: { frame: SheetFrame; tile?: boolean }) {
  const cls = tile ? 'q-sheet-tile-frame' : 'q-sheet-frame';
  const url = 'url' in frame ? frame.url : null;
  if (url) {
    return (
      <span className={cls} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" />
      </span>
    );
  }
  const initials = 'initials' in frame ? frame.initials : undefined;
  const icon = 'icon' in frame ? frame.icon : undefined;
  return <span className={cls} aria-hidden="true">{icon ?? initials ?? '·'}</span>;
}

function Figure({ figure }: { figure: SheetFigure }) {
  const cls = ['q-sheet-fig', figure.due ? 'q-sheet-fig-due' : '', figure.none ? 'q-sheet-fig-none' : '']
    .filter(Boolean).join(' ');
  return <span className={cls}>{figure.text}</span>;
}

function Caption({ item }: { item: SheetItem }) {
  const text = captionText(item);
  return (
    <span className="q-sheet-cap">
      {text ?? <span className="q-absent">{item.absent ?? 'Nothing to say yet'}</span>}
    </span>
  );
}

/**
 * One row. When the item carries an action the row is a box with a face link
 * stretched over it and the action above the face; otherwise the row is the
 * link, which is simpler markup and one fewer element to tab through.
 */
export function SheetRow({ item }: { item: SheetItem }) {
  const cls = ['q-sheet-row', item.dim ? 'q-sheet-row-dim' : ''].filter(Boolean).join(' ');
  const body = (
    <>
      <Frame frame={item.frame} />
      <span className="q-sheet-body">
        <span className="q-sheet-name">{item.name}</span>
        <Caption item={item} />
      </span>
      <span className="q-sheet-side">
        {item.figure && <Figure figure={item.figure} />}
        {item.badge}
        {item.action && <span className="q-sheet-act">{item.action}</span>}
      </span>
    </>
  );
  if (item.action) {
    return (
      <div className={cls}>
        <Link href={item.href} className="q-sheet-face" aria-label={item.name} />
        {body}
      </div>
    );
  }
  return <Link href={item.href} className={cls}>{body}</Link>;
}

/** The same item as a card: the facts laid vertically under a frame. */
export function SheetTile({ item }: { item: SheetItem }) {
  const cls = ['q-sheet-tile', item.dim ? 'q-sheet-row-dim' : ''].filter(Boolean).join(' ');
  const body = (
    <>
      <Frame frame={item.frame} tile />
      <span className="q-sheet-tile-body">
        <span className="q-sheet-name">{item.name}</span>
        <Caption item={item} />
        {(item.figure || item.badge || item.action) && (
          <span className="q-sheet-tile-foot">
            {item.figure ? <Figure figure={item.figure} /> : <span />}
            <span className="q-row q-row-sm">
              {item.badge}
              {item.action && <span className="q-sheet-act">{item.action}</span>}
            </span>
          </span>
        )}
      </span>
    </>
  );
  if (item.action) {
    return (
      <div className={cls}>
        <Link href={item.href} className="q-sheet-face" aria-label={item.name} />
        {body}
      </div>
    );
  }
  return <Link href={item.href} className={cls}>{body}</Link>;
}

/**
 * The list, in whichever view the page's toggle has chosen.
 *
 * `dense` is the List view: the sheet, one column. Otherwise Cards: a grid of
 * tiles, three or more across on a wide screen.
 */
export function Sheet({ items, dense }: { items: SheetItem[]; dense: boolean }) {
  if (dense) {
    return (
      <div className="q-sheet">
        {items.map((item) => <SheetRow key={item.id} item={item} />)}
      </div>
    );
  }
  return (
    <div className="q-sheet-grid">
      {items.map((item) => <SheetTile key={item.id} item={item} />)}
    </div>
  );
}
