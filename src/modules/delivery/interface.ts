/**
 * Delivery — public interface. The only door in.
 * Bundles of finished files handed to a client for a booking. Bookings renders
 * deliveries through here; the public gallery resolves a share token to signed
 * URLs without a session.
 */
export {
  createDelivery,
  getUploadTarget,
  registerFile,
  removeFile,
  shareDelivery,
  unshareDelivery,
  listDeliveriesForBooking,
  getGalleryByToken,
} from './domain';
