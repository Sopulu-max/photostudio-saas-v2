/**
 * Matching a name the studio typed against one already stored.
 *
 * WHAT WAS WRONG. Every find-or-create in the app asked the database
 * `.ilike('name', typed)` and treated a hit as "this already exists". ILIKE is a
 * PATTERN match, not an equality test, so the typed name was being read as a
 * pattern: `_` matches any single character, `%` matches any run of them, and
 * PostgREST turns `*` into `%` before the query is even sent. Probed against the
 * live database, all three of `Photograph_r`, `Photograph%` and `Photograph*r`
 * came back matching the role "Photographer".
 *
 * So a workflow called `Post_production` could find and silently reuse
 * `Post-production`; a deliverable called `4x6 print` is fine, but `4_6 print`
 * would match `4x6 print`. The studio would name a second thing and get the
 * first one back, with no error anywhere — the same shape as the `'5x7' ILIKE
 * '5_7'` bug this codebase has already been bitten by once.
 *
 * Escaping the wildcards was the obvious fix and does not hold: the escape did
 * not survive the trip through PostgREST in testing, and `*` is rewritten before
 * escaping could apply. So the comparison is done here instead, in JavaScript,
 * where an equality test is an equality test.
 *
 * These are all small per-studio lookups — the roles a studio has, the values of
 * one dimension — so fetching the candidates and comparing them costs nothing
 * that matters and cannot be wrong.
 */

/** Trimmed and case-folded, which is the only latitude a name gets. */
export function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Do these two names refer to the same thing? Case and surrounding space aside. */
export function sameName(a: unknown, b: unknown): boolean {
  const left = normalizeName(a);
  return left !== '' && left === normalizeName(b);
}

/**
 * The row whose name is the one given, or undefined.
 *
 * Takes the rows a query already returned rather than doing its own, so the
 * caller keeps control of the scoping — which organization, which domain, which
 * dimension — and this only answers the part ILIKE got wrong.
 */
export function findByName<T extends Record<string, any> = any>(
  rows: T[] | null | undefined,
  name: unknown,
): T | undefined {
  const needle = normalizeName(name);
  if (!needle) return undefined;
  return (rows || []).find((row) => normalizeName(row?.name) === needle);
}
