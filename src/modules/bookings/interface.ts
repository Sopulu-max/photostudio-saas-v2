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
  // Commands
  createBooking,
  refreshBookingTitle,
  renameBooking,
  deleteBooking,
  setBookingSchedule,
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
  getAnsweredQuestionIdsForService,
  getIntakeAnswersForBooking,
  setBookingClient,
  addBookingLine,
  updateBookingLine,
  removeBookingLine,
  // Composition — create other modules' objects against a booking
  createContractForBooking,
  addInvoiceToBooking,
  startWorkForLine,
} from './domain';
