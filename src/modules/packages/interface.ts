/**
 * Packages — public interface. The only door in.
 *
 * The marketing layer: how a studio sells what it does. Bookings reads the
 * catalog through here to build lines; Production asks
 * getProductionPlanForPackage() rather than touching services/packages
 * tables itself — that plan is the union of every bundled Service's Process,
 * so a multi-discipline Package's routing falls out of what it bundles.
 */
// How work gets classified is owned by Services — a dimension belongs to a
// service domain, and applies to Service just as much as Package. Re-exported
// here purely for this module's UI's convenience; Packages never touches those
// tables itself.
export { listDimensionsByDomain } from '@/modules/services/interface';
export type { StudioDimensionShape } from '@/modules/services/interface';

export type { PackageStatus, OperatorPackageStatus } from './domain';

export {
  // Package
  createPackage, updatePackage, duplicatePackage, setPackageStatus,
  // Packages owns package_tasks, so Services asks rather than writing them.
  syncPackageTasksForWorkflow,
  // The package a booking keeps for itself, insulated from later catalog edits.
  // Both booking paths go through this — it is the rule, not a helper.
  // The package a booking should point at — its own copy, made if needed
  ensureInstanceForBooking,
  instantiatePackageForBooking,
  listPackages, listPackagesPublic, listPackagesPublicWithDimensions, getPackage, getPackageForBooking, getPackagePublic,
  // Backwards: where is this service sold? The edge lives here, so the read does.
  listPackagesForService,
    // What these packages promise the client will end up with
  getDeliverablesForPackages,
  // What a package left open — the questions a client still has to answer
  getOpenVariablesForPackage, getOpenVariablesForPackagePublic,
  // A classification narrowed to several is still a question. These are the
  // ones a package has not settled, and the answer that settles them.
  getOpenClassificationsForPackagePublic, getOpenClassificationsForPackage, answerPackageClassifications,
  // Both halves at once, for the operator's form: it asks the moment a package
  // is picked, and a block drawn from two round trips can appear half-built.
  getOpenQuestionsForPackage,
  // Everything the bundle declares, fixed or not — what an operator edits against
  getPackageVariables, getPackageVariablesPublic,
  // Intake questions
  getIntakeQuestions, getIntakeQuestionsPublic, updatePackageQuestions, getLockedQuestionIds,
} from './domain';

// How a deliverable's specification reads — one phrasing everywhere a client sees it.
export { formatDeliverable } from './deliverableSpec';
export type { DeliverableSpec } from './deliverableSpec';
