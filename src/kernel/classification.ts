/**
 * WHETHER A THING ACCEPTS WHAT SOMEBODY ASKED FOR.
 *
 * The studio classifies at three levels in ONE vocabulary. A service says what
 * it can do (`service_dimension_values`); a package narrows that to what it
 * offers (`package_service_dimension_values`); a booking's own instance narrows
 * again to what was agreed. All three point at the same `dimension_values`
 * rows, which is what makes a client's answer comparable against any of them.
 *
 * So the test belongs here rather than in any one module: it is a rule about
 * the vocabulary, not about services or packages. Run it over a service's
 * classification and it answers "can we do this?". Run it over a package's
 * narrowing and it answers "do we already offer this?". Same arithmetic.
 *
 * IT NEVER LEARNS A DIMENSION'S NAME. Nothing here knows what an Occasion is,
 * and nothing should: a value already knows which question it answers, and a
 * studio invents its own vocabulary. That is what lets this encompass whatever
 * a studio adds later without being rewritten — the openness is in the data,
 * and the engine stays ignorant of it on purpose.
 */

/**
 * What a thing has been narrowed to: for each dimension it constrained, the
 * values it admits. A dimension absent from this map was never narrowed.
 */
export type Narrowing = Map<string, Set<string>>;

/** One answer: a value, and the dimension it answers. */
export type Answer = { dimensionId: string; valueId: string };

/**
 * Does this narrowing accept every answer given?
 *
 * THE OPEN-NARROWING RULE, WHICH IS THE WHOLE SUBTLETY. A dimension a thing
 * never narrowed accepts ANY value of it — silence is permission, not refusal.
 * A portrait service that never said anything about Context works indoors and
 * out; reading its silence as "no contexts" would make every unconstrained
 * thing match nothing at all, which is the opposite of what it means.
 *
 * An empty set of answers is admitted by everything, because nothing was asked.
 */
export function admits(narrowing: Narrowing, answers: Answer[]): boolean {
  for (const { dimensionId, valueId } of answers) {
    const allowed = narrowing.get(dimensionId);
    if (!allowed) continue;          // never narrowed — accepts anything
    if (!allowed.has(valueId)) return false;
  }
  return true;
}

/**
 * How squarely a thing answers what was asked — how many of the answers it
 * carries EXPLICITLY.
 *
 * Separate from admits on purpose. A service that never narrowed Occasion
 * admits a wedding, but a service that lists Wedding among its occasions says
 * so; both are usable and the second is the better answer. So admits decides
 * what may be offered and this decides what to offer first.
 */
export function specificity(narrowing: Narrowing, answers: Answer[]): number {
  let carried = 0;
  for (const { dimensionId, valueId } of answers) {
    if (narrowing.get(dimensionId)?.has(valueId)) carried += 1;
  }
  return carried;
}

/**
 * Build a Narrowing from flat rows.
 *
 * Every table that classifies is a join table of (owner, dimension_value), so
 * every caller has rows of this shape and none of them should assemble the map
 * themselves.
 */
export function narrowingFrom(
  rows: { dimensionId: string; valueId: string }[],
): Narrowing {
  const map: Narrowing = new Map();
  for (const { dimensionId, valueId } of rows) {
    const set = map.get(dimensionId) ?? new Set<string>();
    set.add(valueId);
    map.set(dimensionId, set);
  }
  return map;
}

/**
 * Rank candidates by how well each answers, keeping only those that can.
 *
 * Generic in the candidate, because the caller knows what it is holding and
 * this does not need to.
 */
export function rankByFit<T>(
  candidates: { item: T; narrowing: Narrowing }[],
  answers: Answer[],
): { item: T; carried: number }[] {
  return candidates
    .filter((c) => admits(c.narrowing, answers))
    .map((c) => ({ item: c.item, carried: specificity(c.narrowing, answers) }))
    .sort((a, b) => b.carried - a.carried);
}
