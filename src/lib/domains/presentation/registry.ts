import { FacingTier } from './types';

export type EdgeScope = 'owner' | 'all';

export interface AttributeSchema {
  key: string; // The dot-path or top-level key (e.g., 'profileData.shoeSize')
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum';
  facingTier: FacingTier;
  edgeScope?: EdgeScope; // Defaults to 'all' if omitted
}

export interface EntitySchema {
  entityType: 'Customer' | 'Organization' | 'Service' | 'ServiceInstance' | 'Request' | 'Agreement' | 'Outcome' | 'Identity' | 'Asset';
  attributes: Record<string, AttributeSchema>;
}

export class SchemaRegistry {
  private schemas: Map<string, EntitySchema> = new Map();

  constructor() {
    this.registerBaseOntology();
  }

  private registerBaseOntology() {
    // Base Customer schema
    this.schemas.set('Customer', {
      entityType: 'Customer',
      attributes: {
        'id': { key: 'id', label: 'ID', type: 'string', facingTier: 'never_external' }, // Internal ID
        'email': { key: 'email', label: 'Email', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'phone': { key: 'phone', label: 'Phone', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'profileData.name': { key: 'profileData.name', label: 'Name', type: 'string', facingTier: 'configurable_open' },
      }
    });

    // Base Agreement schema
    this.schemas.set('Agreement', {
      entityType: 'Agreement',
      attributes: {
        'terms.price': { key: 'terms.price', label: 'Price', type: 'number', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
      }
    });
  }

  public getEntitySchema(entityType: string): EntitySchema | undefined {
    return this.schemas.get(entityType);
  }

  public getAttributeSchema(entityType: string, key: string): AttributeSchema | undefined {
    const schema = this.schemas.get(entityType);
    return schema?.attributes[key];
  }

  // A studio can extend the schema at runtime
  public registerCustomAttribute(entityType: EntitySchema['entityType'], attribute: AttributeSchema) {
    let schema = this.schemas.get(entityType);
    if (!schema) {
      schema = { entityType, attributes: {} };
      this.schemas.set(entityType, schema);
    }
    schema.attributes[attribute.key] = attribute;
  }
}

// Singleton for Stage 0 (in a real app, this might be instanced per-tenant or globally with tenant overrides)
export const globalSchemaRegistry = new SchemaRegistry();
