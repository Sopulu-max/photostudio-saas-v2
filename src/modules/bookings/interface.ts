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
  addBookingLine,
  // Composition — create other modules' objects against a booking
  createContractForBooking,
  addInvoiceToBooking,
  startWorkForLine,
} from './domain';
