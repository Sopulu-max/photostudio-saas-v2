/**
 * Services — public interface. The only door in.
 * Bookings reads the catalog through here to build lines; Production asks
 * getStagesForService() rather than touching services/blueprints itself.
 */
export {
  createService,
  listServices,
  getService,
  setServiceBlueprint,
  createBlueprint,
  listBlueprints,
  getProductionPlanForService,
} from './domain';
