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

/**
 * How each dimension reads, in one place.
 *
 * These were duplicated in the chooser and half-duplicated in the booking form.
 * A dimension's own name for itself is a property of the vocabulary, not of
 * whichever surface happens to render it.
 */
export const DIMENSION_LABELS: Record<Dimension, { label: string; question: string; example: string }> = {
  subject:  { label: 'Subject',  question: 'What is being photographed?',    example: 'Person, Product, Building' },
  occasion: { label: 'Occasion', question: 'What occasion is it for?',       example: 'Wedding, Birthday' },
  context:  { label: 'Context',  question: 'Where, and under what conditions?', example: 'Studio, Outdoor' },
  purpose:  { label: 'Purpose',  question: 'What is it for?',                example: 'Passport, Advertising, Editorial' },
  client:   { label: 'Client',   question: 'Who is the client?',             example: 'Individual, Family, Corporate' },
};
