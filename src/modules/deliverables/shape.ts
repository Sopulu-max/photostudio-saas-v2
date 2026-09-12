/**
 * What a deliverable link looks like, in one place, for everyone who reads one.
 *
 * A plain module rather than `'use server'`, for the same reason
 * packages/deliverableSpec is one: these are values and rules, imported and
 * used in place, not actions to call. A `'use server'` file may only export
 * async functions — the build refuses anything else — so pure logic lives here
 * beside the fragments rather than being made async to fit a file it does not
 * belong in.
 *
 * WHY THIS EXISTS. Moving the WRITES into this module stopped three callers
 * inserting different column lists. It did nothing about the reads: nine nested
 * selects across Packages, Services, Delivery and Bookings each named the
 * columns of a deliverable link by hand, inside a bigger query fetching a tree.
 *
 * Those cannot become calls into this module without turning one query into
 * N+1 — a package page would fetch its bundle, then a round trip per row. So
 * they stay nested and share a definition instead. If a promise gains a column,
 * it is added here and every reader has it.
 *
 * This is the same fault the writes had, and it had already bitten: the copier
 * listed deliverable_id and quantity and forgot spec_values, so duplicating a
 * package dropped the specification it was sold with.
 */

/**
 * A deliverable named, for a list that only has to say which one.
 *
 * `position` travels with it because the ORDER is the studio's, not the
 * database's — see byPromiseOrder below.
 */
export const DELIVERABLE_REF = 'deliverable:deliverables(id, name, position)';

/**
 * A deliverable with what a reader needs beside its name: the unit it is
 * counted in. What it needs SETTLING is no longer here — a deliverable declares
 * real variables now, and their answers arrive through package_variable_values
 * like every other answer.
 */
export const DELIVERABLE_WITH_SHAPE =
  'deliverable:deliverables(id, name, position, default_unit)';

/**
 * THE ORDER A STUDIO PUT ITS PROMISES IN.
 *
 * A package's promises hang off its bundle rows, so the order they come back
 * in is the order PostgREST happened to join them — and two readers of the
 * same package disagreed because they joined differently. Standard Event
 * Coverage read "20 Edited photographs · 2 Edited video" on the studio's own
 * catalogue and "2 Edited video · 20 Edited photographs" on the client's, for
 * the same package, at the same moment.
 *
 * `deliverables.position` is the order the studio arranged its own
 * deliverables in, which is the only order here that means anything. Sorted
 * once, in the module that owns the shape, rather than in each of the four
 * screens that render a promise — a comparator copied four times is four
 * comparators the day one of them is corrected.
 *
 * A deliverable with no position sorts last rather than first: absent is not
 * zero, and a studio that has never arranged them should not have the newest
 * one leading.
 */
export function byPromiseOrder(
  a: { position?: number | null; name?: string | null },
  b: { position?: number | null; name?: string | null },
): number {
  const pa = a.position ?? Number.MAX_SAFE_INTEGER;
  const pb = b.position ?? Number.MAX_SAFE_INTEGER;
  if (pa !== pb) return pa - pb;
  return (a.name || '').localeCompare(b.name || '');
}

/** What a package promises: the kind and how many. */
export const PACKAGE_PROMISE =
  `package_deliverables(quantity, decided_by, ${DELIVERABLE_WITH_SHAPE})`;

/**
 * The answers a bundle row holds, enough to say what was settled about a
 * deliverable it promises.
 *
 * Selected wherever a promise is going to be RENDERED, because what a promise
 * says is no longer on the promise row: a deliverable declares real variables
 * and a package answers them like any other, so the sentence is assembled from
 * those answers.
 */
export const PROMISE_ANSWERS =
  'package_variable_values(value, answered_by, variable:variables(id, key, deliverable_id))';

/** The same, where only the name is rendered. */
export const PACKAGE_PROMISE_NAMED =
  /*
   * Built from DELIVERABLE_REF rather than spelling the columns again. It had
   * its own copy — `deliverables(id, name)` — so adding `position` to the
   * shared ref left this one select silently without it, and the public
   * catalogue went on sorting by the name fallback while every other reader
   * honoured the studio's order. A second copy of a column list is a second
   * place to forget a column, which is the fault this whole file exists to
   * stop.
   */
  `package_deliverables(quantity, ${DELIVERABLE_REF})`;

/** Enough to count promises without carrying what they say. */
export const PACKAGE_PROMISE_COUNT = 'package_deliverables(id)';

/** What a service can produce. */
export const SERVICE_OFFERS = `service_deliverables(${DELIVERABLE_REF})`;

/** Which promises a delivery closes out. */
export const DELIVERY_FULFILS = `delivery_deliverables(${DELIVERABLE_REF})`;
/**
 * The answers still available for a deliverable's question, given the services
 * producing it in this bundle.
 *
 * Intersected, not unioned. A package bundling a digital-only service and a
 * print-only service can promise a deliverable both produce, but the answer has
 * to be one they can BOTH make — offering the union would let a package sell a
 * combination nothing in it performs.
 */
export function narrowOptions(declared: string[], permittedByEachService: string[][]): string[] {
  let out = declared;
  for (const permitted of permittedByEachService) {
    if (permitted.length === 0) continue; // that service narrows nothing
    out = out.filter((v) => permitted.includes(v));
  }
  /*
   * A bundle whose services agree on nothing leaves the question unanswerable,
   * and an empty dropdown tells an operator nothing about why. Falling back to
   * what the deliverable declares keeps the form usable and puts the
   * contradiction where it belongs — in what the studio said its services do —
   * rather than in a control that silently cannot be filled.
   */
  return out.length > 0 ? out : declared;
}

/**
 * What a package settled about one deliverable it promises.
 *
 * ONE READER, BECAUSE EVERY SURFACE THAT RENDERS A PROMISE NEEDS IT. The
 * package page, the storefront listing, the booking page and the client's
 * confirmation all say what was promised — and when the spec moved off the
 * promise row and onto variable answers, only the first of them was taught
 * where to look. The other three quietly went back to saying "20 Edited
 * photographs" with no mention of softcopy, which is exactly the sentence the
 * declaration exists to produce.
 *
 * Keyed by the variable's key, which is what formatDeliverable renders.
 */
export function specFromAnswers(
  packageVariableValues: any[] | null | undefined,
  deliverableId: string,
): Record<string, unknown> {
  return Object.fromEntries(
    ((packageVariableValues || []) as any[])
      .filter((pv) => pv?.variable?.deliverable_id === deliverableId)
      .filter((pv) => pv.value !== null && pv.value !== '')
      .map((pv) => [pv.variable.key, pv.value]),
  );
}
