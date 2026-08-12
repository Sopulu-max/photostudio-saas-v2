/**
 * Packages — public interface. The only door in.
 *
 * The marketing layer: how a studio sells what it does. Bookings reads the
 * catalog through here to build lines; Production asks
 * getProductionPlanForPackage() rather than touching services/packages
 * tables itself — that plan is the union of every bundled Service's Process,
 * so a multi-discipline Package's routing falls out of what it bundles.
 */
// The five classification dimensions — Subject, Occasion, Context, Purpose,
// Client — are owned by Services (they apply to Service just as much as
// Package). Re-exported here purely for this module's UI's convenience;
// Packages never touches those tables itself.
export {
  DIMENSIONS as PACKAGE_DIMENSIONS,
  getEnabledDimensions,
} from '@/modules/services/interface';
export type { Dimension as PackageDimension } from '@/modules/services/interface';

export {
  // Package
  createPackage, updatePackage, duplicatePackage, setPackageStatus,
  listPackages, listPackagesPublic, listPackagesPublicWithDimensions, getPackage, getPackageForBooking, getPackagePublic,
  getProductionPlanForPackage, getPaymentPoliciesForPackages,
  // What these packages promise the client will end up with
  getDeliverablesForPackages,
  // What a package left open — the questions a client still has to answer
  getOpenVariablesForPackage, getOpenVariablesForPackagePublic,
  // Everything the bundle declares, fixed or not — what an operator edits against
  getPackageVariables, getPackageVariablesPublic,
  // Intake questions
  getIntakeQuestions, getIntakeQuestionsPublic, updatePackageQuestions, getLockedQuestionIds,
} from './domain';
export type { PaymentPolicy, PricingVariant } from './domain';

// How a deliverable's specification reads — one phrasing everywhere a client sees it.
export { formatDeliverable } from './deliverableSpec';
export type { DeliverableSpec } from './deliverableSpec';
