/**
 * Delivery — public interface. The only door in.
 * Bundles of finished files handed to a client for a booking. Bookings renders
 * deliveries through here; the public gallery resolves a share token to signed
 * URLs without a session.
 */
export {
  createDelivery,
  updateDelivery,
  deleteDelivery,
  archiveDelivery,
  unarchiveDelivery,
  getUploadTarget,
  registerFile,
  removeFile,
  shareDelivery,
  unshareDelivery,
  listDeliveriesForBooking,
  getGalleryByToken,
  // The promise a booking made, and whether it has been kept
  setDeliveryFulfils,
  getPromisedDeliverables,
  getFulfilmentForBooking,
} from './domain';
