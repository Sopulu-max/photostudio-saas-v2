import { AudienceContext, FacingConfig, TIER_NEVER_EXTERNAL, TIER_COUNTERPARTY_GUARANTEED, TIER_CONFIGURABLE_CLOSED, TIER_CONFIGURABLE_OPEN } from './types';
import { SchemaRegistry } from './schema-registry';

/**
 * The Audience-Context Resolver.
 * Enforces the F1 and F2 facing laws on any DTO before it reaches the presentation layer.
 */
export function resolveForAudience<T extends Record<string, any>>(
  entity: T,
  entityType: string,
  audience: AudienceContext,
  config: FacingConfig
): Partial<T> {
  // Staff bypasses the facing filters (they see everything).
  if (audience.role === 'staff') {
    return { ...entity };
  }

  return scrubObject(entity, entityType, audience, config, '');
}

/**
 * Recursively scrubs an object based on the SchemaRegistry.
 */
function scrubObject(
  obj: any,
  entityType: string,
  audience: AudienceContext,
  config: FacingConfig,
  currentPath: string
): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => scrubObject(item, entityType, audience, config, currentPath));
  }

  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Construct the path for the registry lookup
    // If it's a top-level key, it's 'AgreementDTO.status'
    // If it's nested inside fulfillmentData, it's 'ServiceInstanceDTO.fulfillmentData.nestedKey'
    const absolutePath = currentPath ? `${currentPath}.${key}` : `${entityType}.${key}`;
    
    // Check registry for exact path. If not found, check parent path (if nested).
    let tier = SchemaRegistry[absolutePath];
    
    if (!tier && currentPath) {
      // Fallback: If we don't have 'ServiceInstanceDTO.fulfillmentData.internalNotes', 
      // but we do have 'ServiceInstanceDTO.fulfillmentData', use the parent's tier.
      tier = SchemaRegistry[currentPath];
    }

    // Ultimate fallback: F1 (deny by default)
    if (!tier) {
      tier = TIER_NEVER_EXTERNAL;
    }

    const isCounterparty = audience.id !== null && obj.customerId === audience.id;

    // Apply Facing Laws
    let shouldInclude = false;

    switch (tier) {
      case TIER_NEVER_EXTERNAL:
        shouldInclude = false; // Hard drop for non-staff
        break;

      case TIER_COUNTERPARTY_GUARANTEED:
        shouldInclude = isCounterparty; // F2 guarantee
        break;

      case TIER_CONFIGURABLE_CLOSED:
        // Closed by default, check if studio configured it to be open
        shouldInclude = config[absolutePath] === true;
        break;

      case TIER_CONFIGURABLE_OPEN:
        // Open by default, check if studio explicitly closed it
        shouldInclude = config[absolutePath] !== false;
        break;
    }

    if (shouldInclude) {
      // Recurse into nested objects
      if (typeof value === 'object' && value !== null) {
        // Special case: if this is a related entity (like AgreementDTO.request), 
        // we might want to change the entityType. For now, we rely on the registry 
        // mapping 'AgreementDTO.request' to guarantee it, and then we scrub the 
        // child object using 'RequestDTO' if we can infer it.
        // For Stage 0, we just continue the path (e.g. AgreementDTO.request.status).
        // Since we mapped 'AgreementDTO.request' as TIER_COUNTERPARTY_GUARANTEED, 
        // we include it, but we still recurse to scrub its children.
        const childType = getInferredEntityType(entityType, key);
        const nextPath = childType ? childType : absolutePath;
        
        result[key] = scrubObject(value, childType || entityType, audience, config, childType ? '' : absolutePath);
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Helper to infer entity types for relations.
 * e.g. If we are in AgreementDTO and the key is 'request', the child is a RequestDTO.
 */
function getInferredEntityType(parentType: string, key: string): string | null {
  if (parentType === 'AgreementDTO' && key === 'request') return 'RequestDTO';
  if (parentType === 'AgreementDTO' && key === 'instances') return 'ServiceInstanceDTO';
  return null;
}
