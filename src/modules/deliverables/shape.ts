/**
 * What a deliverable link looks like, in one place, for everyone who reads one.
 *
 * A plain module rather than `'use server'`, for the same reason
 * packages/deliverableSpec is one: these are values, imported and interpolated
 * into a query, not actions to call.
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

/** A deliverable named, for a list that only has to say which one. */
export const DELIVERABLE_REF = 'deliverable:deliverables(id, name)';

/**
 * A deliverable with what a reader needs beside its name: the unit it is
 * counted in. What it needs SETTLING is no longer here — a deliverable declares
 * real variables now, and their answers arrive through package_variable_values
 * like every other answer.
 */
export const DELIVERABLE_WITH_SHAPE =
  'deliverable:deliverables(id, name, default_unit)';

/** What a package promises: the kind, how many, and what was settled about it. */
export const PACKAGE_PROMISE =
  `package_deliverables(quantity, ${DELIVERABLE_WITH_SHAPE})`;

/** The same, where only the name is rendered. */
export const PACKAGE_PROMISE_NAMED =
  `package_deliverables(quantity, deliverable:deliverables(name))`;

/** Enough to count promises without carrying what they say. */
export const PACKAGE_PROMISE_COUNT = 'package_deliverables(id)';

/** What a service can produce. */
export const SERVICE_OFFERS = `service_deliverables(${DELIVERABLE_REF})`;

/** Which promises a delivery closes out. */
export const DELIVERY_FULFILS = `delivery_deliverables(${DELIVERABLE_REF})`;
