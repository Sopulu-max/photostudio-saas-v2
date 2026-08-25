/**
 * Bookings — the module's public interface: the only door in.
 *
 * Its own surface and every other module import operations from here, never from
 * `domain.ts` or the `bookings` / `booking_lines` tables directly. That seam is
 * what keeps the modular monolith from collapsing into a tangle — see the
 * Target Architecture. When Contracts / Finances / Production are rebuilt as
 * modules, they compose onto a booking through these operations + its id.
 */
export {
  // Reads — the surfaces ask for these rather than querying the tables
  getBooking,
  listBookings,
  getBookingCountsByContact,
  // The dimension graph's one crossing into real work: what was actually booked
  // under a classification. Lives here because the chain ends here.
  listBookingsForDimensionValue,
  // What a line is actually configured as — the offer plus the client's answers
  setLineConfiguration,
  getLineConfiguration,
  getLineConfigurationForm,
  // Commands
  createBooking,
  // Intake from the public booking page — takes an explicit org, no session
  createBookingFromIntake,
  refreshBookingTitle,
  renameBooking,
  // The booking's own record, saved as one — what the edit page commits
  updateBookingRecord,
  deleteBooking,
  setBookingSchedule,
  suggestedDurationForBooking,
  extractPackageFromEnquiry,
  // The staffing cascade: which roles the booked Packages' blueprints call for
  getStaffingNeedsForBooking,
  // Stages — the studio's own lifecycle
  listStages,
  setBookingStage,
  reviewCascadeForCancel,
  createStage,
  renameStage,
  setStageColor,
  updateStage,
  deleteStage,
  setDefaultStage,
  listBookingsInRange,
  listBookingsForContact,
  getAnsweredQuestionIdsForPackage,
  getIntakeAnswersForBooking,
  setBookingClient,
  addBookingLine,
  updateBookingLine,
  removeBookingLine,
  // Composition — create other modules' objects against a booking
  createContractForBooking,
  } from './domain';
