/**
 * The five possible questions a business can classify its work by — closed
 * and engine-owned, same as everywhere else bounded in this system. Not a
 * "use server" export: domain.ts can only export async functions, so this
 * plain constant/type lives here instead.
 *
 * Owned by Services, not Packages: these apply to both — a Service can be
 * Subject=Real Estate just as meaningfully as a Package can — and Services
 * is the lower layer Packages already depends on, never the reverse.
 */
export const DIMENSIONS = ['subject', 'occasion', 'context', 'purpose', 'client'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
