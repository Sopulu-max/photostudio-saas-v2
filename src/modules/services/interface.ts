/**
 * Services — public interface. The only door in.
 *
 * The ontology layer: Service Domains, Services (the specific
 * transformations a studio performs), Deliverables (what they produce), and
 * Blueprints (how — a Service's Process, already routed to Team's roles).
 *
 * What a studio sells is a different module (Packages) — it asks this
 * interface for the real Services it bundles and the Processes they run,
 * never touching these tables directly.
 */
export {
  // Service Domains — the broad capability
  listServiceDomains,
  getServiceDomain,
  createServiceDomain,
  renameServiceDomain, deleteServiceDomain,
  updateServiceDomainDNA,
  // Deliverables and Delivery Containers — the vocabulary of what a Service produces
  listDeliverables, createDeliverable, renameDeliverable, deleteDeliverable,
  listDeliveryContainers, createDeliveryContainer, renameDeliveryContainer, deleteDeliveryContainer,
  // The five classification dimensions — Subject, Occasion, Context, Purpose,
  // Client. Apply to both Service and Package; owned here since Packages
  // already depends on Services one-way, never the reverse.
  getEnabledDimensions, setEnabledDimensions, findOrCreateDimensionValue,
  listOccasions, createOccasion, renameOccasion, deleteOccasion,
  listContexts, createContext, renameContext, deleteContext,
  listSubjects, createSubject, renameSubject, deleteSubject,
  listPurposes, createPurpose, renamePurpose, deletePurpose,
  listClientTypes, createClientType, renameClientType, deleteClientType,
  // Blueprints — a Service's Process
  createBlueprint, updateBlueprint, deleteBlueprint, listBlueprints,
  getProductionPlanForService, getDeliverableIdsForServices,
  // Services — the specific transformation
  createService, updateService, duplicateService, setServiceStatus,
  listServices, listActiveServices, getService, getPublicIntakeDimensions,
} from './domain';

export { DIMENSIONS } from './dimensions';
export type { Dimension } from './dimensions';

export {
  // Intake question field-type registry — shared vocabulary, used wherever a
  // Package builds the questions it asks a client.
  FIELD_TYPES, FIELD_TYPE_LIST, fieldType, validateAnswers, storeAnswers,
} from './fieldTypes';
export type { FieldTypeKey, IntakeQuestion, FieldTypeDef } from './fieldTypes';

export { SERVICE_TEMPLATES, templatesByDomain, getTemplate } from './templates';
export type { ServiceTemplate, TemplateQuestion, TemplateStage } from './templates';

export { buildDeliverableSuggestions, buildDimensionSuggestions } from './suggestions';
export type { DeliverableSuggestions, DimensionSuggestions } from './suggestions';
