import { FacingTier } from './types';

export type EdgeScope = 'owner' | 'all';

export interface AttributeSchema {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'object' | 'array';
  facingTier: FacingTier;
  edgeScope?: EdgeScope; // Defaults to 'all' if omitted
}

export interface EntitySchema {
  entityType: 'Customer' | 'Organization' | 'Service' | 'ServiceInstance' | 'Request' | 'Agreement' | 'Asset' | 'Outcome' | 'Identity';
  ownerEdge?: string; // The property name that links to the owner counterparty (e.g., 'customerId')
  attributes: Record<string, AttributeSchema>;
}

export class SchemaRegistry {
  private schemas: Map<string, EntitySchema> = new Map();

  constructor() {
    this.registerBaseOntology();
  }

  private registerBaseOntology() {
    // --- 1. Customer ---
    this.schemas.set('Customer', {
      entityType: 'Customer',
      ownerEdge: 'id', // A Customer owns themselves
      attributes: {
        'id': { key: 'id', label: 'ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'organizationId': { key: 'organizationId', label: 'Org ID', type: 'string', facingTier: 'configurable_open' },
        'primaryIdentifier': { key: 'primaryIdentifier', label: 'Primary ID', type: 'string', facingTier: 'never_external' }, // Internal lookup
        'profileData': { key: 'profileData', label: 'Profile Data', type: 'object', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'profileData.name': { key: 'profileData.name', label: 'Name', type: 'string', facingTier: 'configurable_open' },
        'profileData.email': { key: 'profileData.email', label: 'Email', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'profileData.phone': { key: 'profileData.phone', label: 'Phone', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'status': { key: 'status', label: 'Status', type: 'string', facingTier: 'never_external' },
        'createdAt': { key: 'createdAt', label: 'Created At', type: 'date', facingTier: 'never_external' },
        'updatedAt': { key: 'updatedAt', label: 'Updated At', type: 'date', facingTier: 'never_external' }
      }
    });

    // --- 2. Organization ---
    this.schemas.set('Organization', {
      entityType: 'Organization',
      attributes: {
        'id': { key: 'id', label: 'ID', type: 'string', facingTier: 'configurable_open' },
        'name': { key: 'name', label: 'Name', type: 'string', facingTier: 'configurable_open' },
        'createdAt': { key: 'createdAt', label: 'Created At', type: 'date', facingTier: 'never_external' },
        'updatedAt': { key: 'updatedAt', label: 'Updated At', type: 'date', facingTier: 'never_external' }
      }
    });

    // --- 3. Identity ---
    this.schemas.set('Identity', {
      entityType: 'Identity',
      attributes: {
        'id': { key: 'id', label: 'ID', type: 'string', facingTier: 'configurable_open' },
        'organizationId': { key: 'organizationId', label: 'Org ID', type: 'string', facingTier: 'configurable_open' },
        'name': { key: 'name', label: 'Studio Name', type: 'string', facingTier: 'configurable_open' },
        'logoUrl': { key: 'logoUrl', label: 'Logo', type: 'string', facingTier: 'configurable_open' },
        'brandColors': { key: 'brandColors', label: 'Brand Colors', type: 'object', facingTier: 'configurable_open' },
        'typography': { key: 'typography', label: 'Typography', type: 'object', facingTier: 'configurable_open' },
        'contactData': { key: 'contactData', label: 'Contact Details', type: 'object', facingTier: 'configurable_open' }
      }
    });

    // --- 4. Service ---
    this.schemas.set('Service', {
      entityType: 'Service',
      attributes: {
        'id': { key: 'id', label: 'ID', type: 'string', facingTier: 'configurable_open' },
        'organizationId': { key: 'organizationId', label: 'Org ID', type: 'string', facingTier: 'configurable_open' },
        'name': { key: 'name', label: 'Name', type: 'string', facingTier: 'configurable_open' },
        'description': { key: 'description', label: 'Description', type: 'string', facingTier: 'configurable_open' },
        'pricingRules': { key: 'pricingRules', label: 'Pricing Rules', type: 'object', facingTier: 'configurable_closed' },
        'requiredFields': { key: 'requiredFields', label: 'Required Fields', type: 'object', facingTier: 'configurable_open' },
        'status': { key: 'status', label: 'Status', type: 'string', facingTier: 'configurable_open' },
        'createdAt': { key: 'createdAt', label: 'Created At', type: 'date', facingTier: 'configurable_open' },
        'updatedAt': { key: 'updatedAt', label: 'Updated At', type: 'date', facingTier: 'configurable_open' }
      }
    });

    // --- 5. Request ---
    this.schemas.set('Request', {
      entityType: 'Request',
      ownerEdge: 'customerId',
      attributes: {
        'id': { key: 'id', label: 'ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'organizationId': { key: 'organizationId', label: 'Org ID', type: 'string', facingTier: 'configurable_open' },
        'customerId': { key: 'customerId', label: 'Customer ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'requestedServices': { key: 'requestedServices', label: 'Requested Services', type: 'array', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'status': { key: 'status', label: 'Status', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'createdAt': { key: 'createdAt', label: 'Created At', type: 'date', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'updatedAt': { key: 'updatedAt', label: 'Updated At', type: 'date', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' }
      }
    });

    // --- 6. Agreement ---
    this.schemas.set('Agreement', {
      entityType: 'Agreement',
      ownerEdge: 'customerId',
      attributes: {
        'id': { key: 'id', label: 'ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'organizationId': { key: 'organizationId', label: 'Org ID', type: 'string', facingTier: 'configurable_open' },
        'customerId': { key: 'customerId', label: 'Customer ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'requestId': { key: 'requestId', label: 'Request ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'status': { key: 'status', label: 'Status', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'terms': { key: 'terms', label: 'Terms', type: 'object', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'terms.price': { key: 'terms.price', label: 'Price', type: 'number', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'createdAt': { key: 'createdAt', label: 'Created At', type: 'date', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'updatedAt': { key: 'updatedAt', label: 'Updated At', type: 'date', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'request': { key: 'request', label: 'Request', type: 'object', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'instances': { key: 'instances', label: 'Instances', type: 'array', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' }
      }
    });

    // --- 7. ServiceInstance ---
    this.schemas.set('ServiceInstance', {
      entityType: 'ServiceInstance',
      ownerEdge: 'customer_id',
      attributes: {
        'id': { key: 'id', label: 'ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'organizationId': { key: 'organizationId', label: 'Org ID', type: 'string', facingTier: 'configurable_open' },
        'agreementId': { key: 'agreementId', label: 'Agreement ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'serviceId': { key: 'serviceId', label: 'Service ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'status': { key: 'status', label: 'Status', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'fulfillmentData': { key: 'fulfillmentData', label: 'Fulfillment Data', type: 'object', facingTier: 'never_external' }, // F1 Law
        'fulfillmentData.clientProvidedAsset': { key: 'fulfillmentData.clientProvidedAsset', label: 'Provided Asset', type: 'object', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'createdAt': { key: 'createdAt', label: 'Created At', type: 'date', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'updatedAt': { key: 'updatedAt', label: 'Updated At', type: 'date', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' }
      }
    });

    // --- 8. Asset ---
    this.schemas.set('Asset', {
      entityType: 'Asset',
      ownerEdge: 'customerId',
      attributes: {
        'id': { key: 'id', label: 'ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'organizationId': { key: 'organizationId', label: 'Org ID', type: 'string', facingTier: 'configurable_open' },
        'customerId': { key: 'customerId', label: 'Customer ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'instanceId': { key: 'instanceId', label: 'Instance ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'assetType': { key: 'assetType', label: 'Asset Type', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'contentReference': { key: 'contentReference', label: 'Content Ref', type: 'string', facingTier: 'never_external' }, // Internal CDN links usually hidden unless delivered
        'createdAt': { key: 'createdAt', label: 'Created At', type: 'date', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'updatedAt': { key: 'updatedAt', label: 'Updated At', type: 'date', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' }
      }
    });

    // --- 9. Outcome ---
    this.schemas.set('Outcome', {
      entityType: 'Outcome',
      ownerEdge: 'customer_id',
      attributes: {
        'id': { key: 'id', label: 'ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'organizationId': { key: 'organizationId', label: 'Org ID', type: 'string', facingTier: 'configurable_open' },
        'instanceId': { key: 'instanceId', label: 'Instance ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'assetId': { key: 'assetId', label: 'Asset ID', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'usageRights': { key: 'usageRights', label: 'Usage Rights', type: 'object', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'status': { key: 'status', label: 'Status', type: 'string', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'createdAt': { key: 'createdAt', label: 'Created At', type: 'date', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' },
        'updatedAt': { key: 'updatedAt', label: 'Updated At', type: 'date', facingTier: 'counterparty_guaranteed', edgeScope: 'owner' }
      }
    });
  }

  public getEntitySchema(entityType: string): EntitySchema | undefined {
    return this.schemas.get(entityType);
  }

  public getAllSchemas(): EntitySchema[] {
    return Array.from(this.schemas.values());
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

// Singleton for Stage 0
export const globalSchemaRegistry = new SchemaRegistry();
