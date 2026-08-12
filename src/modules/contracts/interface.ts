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
  // The client's own door, for the portal: no session, and nothing about the
  // studio or the signer taken from the caller.
  signContract,
  reviseContractTerms,
  cancelContract,
  getContractTermsTemplate,
  setContractTermsTemplate,
} from './domain';
