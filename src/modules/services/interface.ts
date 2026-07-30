/**
 * Services — public interface. The only door in.
 * Bookings reads the catalog through here to build lines; Production asks
 * getStagesForService() rather than touching services/blueprints itself.
 */
export {
  createService,
  updateService,
  setServiceStatus,
  listServices,
  getService,
  setServiceBlueprint,
  createBlueprint,
  updateBlueprint,
  deleteBlueprint,
  listBlueprints,
  getProductionPlanForService,
  // Intake questions
  getIntakeQuestions,
  getIntakeQuestionsPublic,
  updateServiceQuestions,
  getLockedQuestionIds,
} from './domain';
