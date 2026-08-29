/**
 * Services — public interface. The only door in.
 *
 * The ontology layer: Service Domains, Services (the specific
 * transformations a studio performs), Deliverables (what they produce), and
 * Workflows (how — a Service's Process, already routed to Team's roles).
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
  // Deliverables and Delivery Containers — the vocabulary of what a Service produces
  // Moved to @/modules/deliverables/interface
  // How each domain classifies its work. Owned here since Packages already
  // depends on Services one-way, never the reverse — and read per domain,
  // because a domain is the boundary everything below it belongs to.
  listDimensionsByDomain, findOrCreateDimensionValue,
  // Workflows — a Service's Process
    getDeliverableIdsForServices,
  // Service Variables — the quantities that scope a service (outfits, hours)
  listServiceVariables, listVariablesForServices, setServiceVariables,
  // What a bundled service may be narrowed to — asked by Packages before it
  // records a narrowing, so the check lives with the domain that owns it.
  listDimensionValueIdsForServices,
  // Services — the specific transformation
  createService, updateService, duplicateService, setServiceStatus,
  listServices, listActiveServices, getService, getPublicIntakeDimensions,
} from './domain';
export type { WorkflowInput } from './domain';
export { listWorkflowsByDomain, saveWorkflow, deleteWorkflow } from './domain';

export { TEMPLATE_DIMENSION_NAMES, dimensionKey } from './dimensions';
export type { StudioDimensionShape, ServiceDimensionTag, DimensionWrite, PublicIntakeDimension, TemplateDimensionKey } from './dimensions';

export {
  SERVICE_VARIABLE_KINDS, formatVariableValue, parseVariableValue,
  variableKindLabel, variableKindHint, variableNeedsOptions, variableIsNumeric,
} from './variableTypes';
export type { ServiceVariable, ServiceVariableInput, ServiceVariableKind, PackageVariableValue } from './variableTypes';

export {
  // Intake question field-type registry — shared vocabulary, used wherever a
  // Package builds the questions it asks a client.
  FIELD_TYPES, FIELD_TYPE_LIST, fieldType, validateAnswers, storeAnswers,
} from './fieldTypes';
export type { FieldTypeKey, IntakeQuestion, FieldTypeDef } from './fieldTypes';

export { SERVICE_TEMPLATES, templatesByDomain, getTemplate } from './templates';
export type { ServiceTemplate, TemplateQuestion, TemplateStage } from './templates';

export { buildDeliverableSuggestions, buildDimensionSuggestions, buildServiceSuggestions, buildVariableSuggestions, narrowFor } from './suggestions';
export type { Narrowed, DimensionSuggestions, VariableSuggestions } from './suggestions';

// A studio defining how each of its domains classifies work — dimensions are
// the studio's own now, not five the engine owns.
export {
  listDimensionsForDomain, createDimension, renameDimension,
  setDimensionActive, deleteDimension, addDimensionValue, removeDimensionValue,
  setValueParent,
} from './dimensionsAdmin';
export type { StudioDimension } from './dimensionsAdmin';

// Reading the dimension graph backwards — the same edges the service form
// narrows with, entered from the value end. The lens sits on these.
export {
  getDimensionValue, getValuePlace, listValueEntries, whatCarries, whatCoOccursWith,
} from './traversal';
export type { Carrier, CoOccurrence, ValueEntry, ValuePlace } from './traversal';
