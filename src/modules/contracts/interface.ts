/**
 * Contracts — public interface. The only door in.
 * Terms for a booking, versioned and signable. Bookings composes a contract
 * onto a booking through here; it never writes the contracts table itself.
 */
export {
  listContracts,
  getContract,
  draftContractForBooking,
  activateContract,
  reviseContractTerms,
  cancelContract,
  getContractTermsTemplate,
  setContractTermsTemplate,
} from './domain';
