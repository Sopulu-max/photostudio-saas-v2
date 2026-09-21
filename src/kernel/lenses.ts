/**
 * LENSES - the shape a sheet takes when it is read as simple data analysis.
 *
 * AN AXIS IS A QUESTION A SHEET CAN BE BROKEN DOWN BY - narrowed with a
 * select, grouped under headings, read as a distribution. Its items are the
 * values the rows take on it, in the order the axis is read. Axes are read
 * off the data by the module that owns the rows, never a list named in
 * code: a studio's stages, the roles its steps need, its currencies, every
 * dimension it classifies by. A studio that adds a stage, a role or a
 * dimension sees a new value or a new axis; a value nobody takes is not
 * there.
 *
 * Each row says which values it takes on each axis (`takes`), so whoever
 * draws the sheet (components/Analysis) narrows, groups and counts without
 * knowing what an axis is. `none` is what to call the rows that take
 * nothing on the axis (absent when every row takes something). An item may
 * carry a `look` (a stage's chosen colour), a `note` (a band's dates) and
 * `now` (the band that is today).
 */

export type Takes = Record<string, string[]>;

export type LensItem = {
  key: string;
  label: string;
  count: number;
  due?: boolean;
  look?: { kind: string | null; color: string | null };
  note?: string | null;
  now?: boolean;
};

export type LensGroup = {
  key: string;
  label: string;
  none?: string;
  items: LensItem[];
};

/**
 * One axis over a set of rows: the values in `order` that some row takes,
 * each with how many, and the name for rows taking nothing when there are
 * any. `mostFirst` sorts by count instead of the given order.
 */
export function axisOf(
  rows: { takes: Takes }[],
  key: string,
  label: string,
  order: Omit<LensItem, 'count'>[],
  opts: { none?: string; mostFirst?: boolean } = {},
): LensGroup {
  const m = new Map<string, number>();
  for (const r of rows) for (const k of r.takes[key] ?? []) m.set(k, (m.get(k) ?? 0) + 1);
  const items = order.filter((o) => m.has(o.key)).map((o) => ({ ...o, count: m.get(o.key)! }));
  return {
    key,
    label,
    items: opts.mostFirst ? items.sort((a, b) => b.count - a.count) : items,
    none: opts.none && rows.some((r) => (r.takes[key] ?? []).length === 0) ? opts.none : undefined,
  };
}

/** The values of an axis discovered from the rows themselves, by name, when nothing orders them. */
export function valuesSeen(rows: { takes: Takes }[], key: string, nameOf: (k: string) => string): Omit<LensItem, 'count'>[] {
  const seen = new Set<string>();
  for (const r of rows) for (const k of r.takes[key] ?? []) seen.add(k);
  return [...seen].map((k) => ({ key: k, label: nameOf(k) })).sort((a, b) => a.label.localeCompare(b.label));
}
