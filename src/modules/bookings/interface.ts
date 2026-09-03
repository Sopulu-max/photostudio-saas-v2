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
  // What a day is like before anything is committed to it, and what is already
  // on it. The first is safe to ask from a storefront; the second names other
  // clients' bookings and takes a session.
  studioDayPublic, studioDay, whatElseIsOn,
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
  // The client-facing reading of a booking, opened and closed by its studio
  shareBooking,
  unshareBooking,
  // Read by token alone — the client's document has no session behind it
  getBookingByShareToken,
  setBookingSchedule,
  suggestedDurationForBooking,
  // A custom enquiry: what the client described, and whether it can be built on
  getEnquiryForBooking,
  extractPackageFromEnquiry,
  // The staffing cascade: which roles the booked Packages' workflows call for
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
