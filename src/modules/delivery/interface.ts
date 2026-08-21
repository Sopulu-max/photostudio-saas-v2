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
  listGalleries,
  getGalleryByToken,
  // The gallery's own surface: the image it opens with, and one file at a size
  setDeliveryCover,
  resolveGalleryAsset,
  // The promise a booking made, and whether it has been kept
  setDeliveryFulfils,
  getPromisedDeliverables,
  getFulfilmentForBooking,
} from './domain';

/** The sizes the gallery serves, and the guard that validates a requested one. */
export { GALLERY_RENDITIONS, isGalleryRendition, type GalleryRendition } from './renditions';
