import { globalSchemaRegistry, AttributeSchema, EntitySchema } from './registry';
import { AudienceContext, FacingTier, FacingConfig } from './types';

function resolveTier(attr: AttributeSchema, schema: EntitySchema, audience: AudienceContext, entity: any, isConfiguredToExpose: boolean = false): boolean {
  if (audience.role === 'staff') return true;

  switch (attr.facingTier) {
    case 'never_external': // F1 Law
      return false;
    case 'counterparty_guaranteed': // F2 Law
      if (attr.edgeScope === 'owner') {
        if (!schema.ownerEdge) return false;
        return audience.id === entity[schema.ownerEdge];
      }
      return true; // if scope is 'all', it's guaranteed for any counterparty, but usually counterparty implies owner.
    case 'configurable_closed':
      return isConfiguredToExpose;
    case 'configurable_open':
      return isConfiguredToExpose !== false;
    default:
      return false; // Safe default
  }
}

export function resolveEntityForAudience(entity: any, entityType: string, audience: AudienceContext, facingConfig: FacingConfig = {}): any {
  if (!entity) return entity;
  
  // Deep clone to avoid mutating the original
  const resolved = JSON.parse(JSON.stringify(entity));
  
  const schema = globalSchemaRegistry.getEntitySchema(entityType);
  if (!schema) return resolved; // If no schema, fallback to returning as-is (though ideally everything should be registered)

  // Iterate over registered attributes and scrub those that fail the tier check
  for (const [key, attr] of Object.entries(schema.attributes)) {
    const isConfiguredToExpose = facingConfig[attr.key] ?? (attr.facingTier === 'configurable_open');
    const isAllowed = resolveTier(attr, schema, audience, entity, isConfiguredToExpose);
    
    if (!isAllowed) {
      // Scrub it by traversing the object path
      const parts = attr.key.split('.');
      let current = resolved;
      let validPath = true;
      
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          validPath = false;
          break;
        }
        current = current[parts[i]];
      }
      
      if (validPath && current && typeof current === 'object' && parts[parts.length - 1] in current) {
        delete current[parts[parts.length - 1]];
      }
    }
  }

  return resolved;
}

// Backward compatibility alias for specimen/page.tsx
export function resolveForAudience(entity: any, entityType: string, audience: AudienceContext, facingConfig: FacingConfig = {}): any {
  return resolveEntityForAudience(entity, entityType, audience, facingConfig);
}
