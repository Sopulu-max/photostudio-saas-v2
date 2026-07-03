import {
  FacingTier,
  TIER_NEVER_EXTERNAL,
  TIER_COUNTERPARTY_GUARANTEED,
  TIER_CONFIGURABLE_CLOSED,
  TIER_CONFIGURABLE_OPEN
} from './types';

/**
 * The Schema Registry for Presentation.
 * Defines the facing classification (F1/F2 laws) for attributes across kernel entities.
 * 
 * If a path is not defined here, the default fallback is TIER_NEVER_EXTERNAL (deny by default).
 * 
 * Paths are dot-notated: "{EntityType}.{Attribute}"
 * Nested paths are allowed: "{EntityType}.{Attribute}.{NestedAttribute}"
 */
export const SchemaRegistry: Record<string, FacingTier> = {
  // --- ServiceDTO ---
  'ServiceDTO.id': TIER_CONFIGURABLE_OPEN,
  'ServiceDTO.organizationId': TIER_CONFIGURABLE_OPEN,
  'ServiceDTO.name': TIER_CONFIGURABLE_OPEN,
  'ServiceDTO.description': TIER_CONFIGURABLE_OPEN,
  'ServiceDTO.pricingRules': TIER_CONFIGURABLE_CLOSED, // Studio decides if pricing is public
  'ServiceDTO.requiredFields': TIER_CONFIGURABLE_OPEN,
  'ServiceDTO.status': TIER_CONFIGURABLE_OPEN,
  'ServiceDTO.createdAt': TIER_CONFIGURABLE_OPEN,
  'ServiceDTO.updatedAt': TIER_CONFIGURABLE_OPEN,

  // --- CustomerDTO ---
  'CustomerDTO.id': TIER_COUNTERPARTY_GUARANTEED,
  'CustomerDTO.organizationId': TIER_CONFIGURABLE_OPEN,
  'CustomerDTO.primaryIdentifier': TIER_NEVER_EXTERNAL, // Private. Only the customer themselves or staff should see this.
  'CustomerDTO.profileData': TIER_COUNTERPARTY_GUARANTEED,
  'CustomerDTO.status': TIER_NEVER_EXTERNAL,
  'CustomerDTO.createdAt': TIER_NEVER_EXTERNAL,
  'CustomerDTO.updatedAt': TIER_NEVER_EXTERNAL,

  // --- RequestDTO ---
  'RequestDTO.id': TIER_COUNTERPARTY_GUARANTEED,
  'RequestDTO.organizationId': TIER_CONFIGURABLE_OPEN,
  'RequestDTO.customerId': TIER_COUNTERPARTY_GUARANTEED,
  'RequestDTO.requestedServices': TIER_COUNTERPARTY_GUARANTEED,
  'RequestDTO.status': TIER_COUNTERPARTY_GUARANTEED,
  'RequestDTO.createdAt': TIER_COUNTERPARTY_GUARANTEED,
  'RequestDTO.updatedAt': TIER_COUNTERPARTY_GUARANTEED,

  // --- AgreementDTO ---
  'AgreementDTO.id': TIER_COUNTERPARTY_GUARANTEED,
  'AgreementDTO.organizationId': TIER_CONFIGURABLE_OPEN,
  'AgreementDTO.customerId': TIER_COUNTERPARTY_GUARANTEED,
  'AgreementDTO.requestId': TIER_COUNTERPARTY_GUARANTEED,
  'AgreementDTO.status': TIER_COUNTERPARTY_GUARANTEED,
  'AgreementDTO.terms': TIER_COUNTERPARTY_GUARANTEED, // F2 Law: Always visible to counterparty
  'AgreementDTO.createdAt': TIER_COUNTERPARTY_GUARANTEED,
  'AgreementDTO.updatedAt': TIER_COUNTERPARTY_GUARANTEED,
  
  // Relations mapped down
  'AgreementDTO.request': TIER_COUNTERPARTY_GUARANTEED,
  'AgreementDTO.instances': TIER_COUNTERPARTY_GUARANTEED,

  // --- ServiceInstanceDTO ---
  'ServiceInstanceDTO.id': TIER_COUNTERPARTY_GUARANTEED,
  'ServiceInstanceDTO.organizationId': TIER_CONFIGURABLE_OPEN,
  'ServiceInstanceDTO.agreementId': TIER_COUNTERPARTY_GUARANTEED,
  'ServiceInstanceDTO.serviceId': TIER_COUNTERPARTY_GUARANTEED,
  'ServiceInstanceDTO.status': TIER_COUNTERPARTY_GUARANTEED,
  'ServiceInstanceDTO.fulfillmentData': TIER_NEVER_EXTERNAL, // Internal notes/state by default
  'ServiceInstanceDTO.fulfillmentData.clientProvidedAsset': TIER_COUNTERPARTY_GUARANTEED,
  'ServiceInstanceDTO.createdAt': TIER_COUNTERPARTY_GUARANTEED,
  'ServiceInstanceDTO.updatedAt': TIER_COUNTERPARTY_GUARANTEED,
};
