/**
 * A size — width × height — as a shape the engine owns.
 *
 * A framed print has a size. A video has a resolution. An album has a page
 * format. All of them are two numbers in a unit, and none of them can be
 * drawn, compared or checked while they are stored as a word like '16x20'.
 * The one rule this app keeps about a studio's vocabulary — nothing infers
 * meaning from a name — means the engine may not quietly read '16x20' as
 * sixteen by twenty. It may, however, own a shape whose canonical form IS
 * sixteen by twenty, the way it owns a date whose form is '2026-09-11'.
 *
 * So a size is written in one form, '16×20', by the normaliser below, and
 * parsed by the same module wherever it is read. The unit is not in the
 * string: the variable already carries one (`variables.unit`), and saying it
 * twice is how two records of one fact start to disagree.
 *
 * Tolerant on the way IN — a studio types '16x20', '16 X 20', '16 × 20',
 * '16.5x20' and gets the same thing. Strict on the way OUT — there is exactly
 * one spelling in storage, so a booking's answer and a service's permitted
 * option compare as equal strings, which is all `service_deliverable_options`
 * and `booking_line_variable_values` know how to do.
 *
 * Not a "use server" file: pure functions, read by both the studio's editors
 * and the public form.
 */

export type Size = { width: number; height: number };

/** The one separator the engine writes. Anything it reads may use 'x' too. */
const TIMES = '×';

const SIZE_RE = /^\s*(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)\s*$/;

/** '16x20', '16 × 20', '16.5X20' → { width, height }. Anything else → null. */
export function parseSize(raw: unknown): Size | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(SIZE_RE);
  if (!m) return null;
  const width = Number(m[1].replace(',', '.'));
  const height = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

/** The canonical spelling: '16×20'. Trailing zeros dropped, never a locale comma. */
export function formatSize(size: Size): string {
  return `${trim(size.width)}${TIMES}${trim(size.height)}`;
}

/**
 * What the studio typed, in the form the engine stores — or what they typed,
 * unchanged, when it is not a size at all. An option that cannot be parsed is
 * left rather than dropped: the studio wrote it, and a control that silently
 * eats input is worse than one that keeps a word it cannot draw.
 */
export function normaliseSize(raw: string): string {
  const parsed = parseSize(raw);
  return parsed ? formatSize(parsed) : raw.trim();
}

/** '16 × 20 in' — how a size reads to a person, unit and all. */
export function describeSize(raw: unknown, unit?: string | null): string {
  const parsed = parseSize(raw);
  if (!parsed) return raw == null ? '' : String(raw);
  const body = `${trim(parsed.width)} ${TIMES} ${trim(parsed.height)}`;
  return unit ? `${body} ${unit}` : body;
}

/**
 * Every option scaled into one box, so they can be drawn side by side at
 * their true relative proportions. The largest dimension across the whole
 * set fills `max` and everything else is scaled by the same factor — which
 * is the only way an 8×10 beside a 16×20 reads as half the size rather than
 * as two similar rectangles with different labels.
 */
export function fitSizes(options: string[], max: number): { option: string; size: Size | null; w: number; h: number }[] {
  const parsed = options.map((option) => ({ option, size: parseSize(option) }));
  const longest = Math.max(0, ...parsed.map((p) => (p.size ? Math.max(p.size.width, p.size.height) : 0)));
  const scale = longest > 0 ? max / longest : 0;
  return parsed.map((p) => ({
    ...p,
    w: p.size ? Math.max(1, Math.round(p.size.width * scale)) : 0,
    h: p.size ? Math.max(1, Math.round(p.size.height * scale)) : 0,
  }));
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}
