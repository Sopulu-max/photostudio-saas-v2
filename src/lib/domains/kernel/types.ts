import { Database } from '@/lib/database.types';

export type Json = Database['public']['Tables']['customers']['Row']['profile_data'];

export type RequestState = 'created' | 'reviewed' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
export type AgreementState = 'proposed' | 'active' | 'completed' | 'cancelled';
export type InstanceState = 'created' | 'scheduled' | 'in_progress' | 'waiting' | 'completed' | 'delivered' | 'archived' | 'halted';
export type AssetState = 'registered' | 'available' | 'in_use' | 'retained' | 'released';
export type OrganizationState = 'created' | 'active' | 'suspended' | 'archived';
export type CustomerState = 'active' | 'merged' | 'archived';
export type ServiceState = 'active' | 'retired';

export type EntityType = 'request' | 'agreement' | 'service_instance' | 'asset' | 'organization' | 'customer' | 'service' | 'identity';

export interface RequestedService {
  serviceId: string;
  assetId?: string;
}

export interface ModifyAgreementCommand {
  termChanges?: Record<string, unknown>;
  addServices?: RequestedService[];
  removeServices?: string[]; // IDs of instances to halt
}


export interface OrganizationDTO {
  id: string;
  name: string;
  status: OrganizationState;
  createdAt: string;
  archivedAt: string | null;
}

export interface IdentityDTO {
  organizationId: string;
  name: string;
  logoUrl: string | null;
  brandColors: Record<string, string>;
  typography: Record<string, string>;
  contactData: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceDTO {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  pricingRules: Record<string, unknown>;
  requiredFields: Record<string, unknown>;
  status: ServiceState;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDTO {
  id: string;
  organizationId: string;
  primaryIdentifier: string;
  profileData: Record<string, unknown>;
  status: CustomerState;
  createdAt: string;
  updatedAt: string;
}

export interface RequestDTO {
  id: string;
  organizationId: string;
  customerId: string;
  requestedServices: Array<{ serviceId: string, [key: string]: unknown }>;
  status: RequestState;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceInstanceDTO {
  id: string;
  organizationId: string;
  agreementId: string;
  serviceId: string;
  status: InstanceState;
  fulfillmentData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgreementDTO {
  id: string;
  organizationId: string;
  customerId: string;
  requestId: string | null;
  status: AgreementState;
  terms: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  
  // Relations
  request?: RequestDTO;
  instances?: ServiceInstanceDTO[];
}

export interface AssetDTO {
  id: string;
  organizationId: string;
  originType: 'produced' | 'provided';
  originInstanceId: string | null;
  originCustomerId: string | null;
  contentReference: string;
  status: AssetState;
  createdAt: string;
  updatedAt: string;
}

export interface OutcomeDTO extends AssetDTO {
  originType: 'produced';
  originInstanceId: string; // Must be present for produced outcomes
}

export const NON_STATUS_EVENTS = new Set([
  'agreement.modified',
  'asset.delivered',
  'identity.updated',
  'identity.created',
  'service.defined',
  'organization.created',
  'customer.registered',
  'service_instance.workstep'
] as const);

export type NonStatusEvent = typeof NON_STATUS_EVENTS extends Set<infer T> ? T : never;

/**
 * Server-side truth for what events are legal from what states.
 * Strictly adheres to Ops Spec O13 and multi-entity lifecycles.
 */
export const LEGAL_TRANSITIONS = {
  service_instances: {
    'created': ['service_instance.scheduled', 'service_instance.in_progress', 'service_instance.halted'],
    'scheduled': ['service_instance.in_progress', 'service_instance.waiting', 'service_instance.halted'],
    'in_progress': ['service_instance.waiting', 'service_instance.completed', 'service_instance.halted'],
    'waiting': ['service_instance.in_progress', 'service_instance.halted'],
    'halted': ['service_instance.in_progress', 'service_instance.scheduled'],
    'completed': ['service_instance.delivered', 'service_instance.archived'],
    'delivered': ['service_instance.archived'],
    'archived': []
  } as Record<InstanceState, string[]>,
  agreements: {
    'proposed': ['agreement.active', 'agreement.cancelled'],
    'active': ['agreement.completed', 'agreement.cancelled'],
    'completed': [],
    'cancelled': []
  } as Record<AgreementState, string[]>,
  requests: {
    'created': ['request.reviewed', 'request.accepted', 'request.declined', 'request.withdrawn', 'request.expired'],
    'reviewed': ['request.accepted', 'request.declined', 'request.withdrawn', 'request.expired'],
    'accepted': [],
    'declined': [],
    'withdrawn': [],
    'expired': []
  } as Record<RequestState, string[]>,
  assets: {
    'registered': ['asset.available', 'asset.in_use', 'asset.released'],
    'available': ['asset.in_use', 'asset.released'],
    'in_use': ['asset.retained', 'asset.released', 'asset.available'],
    'retained': ['asset.released'],
    'released': []
  } as Record<AssetState, string[]>,
  organizations: {
    'created': ['organization.active', 'organization.suspended', 'organization.archived'],
    'active': ['organization.suspended', 'organization.archived'],
    'suspended': ['organization.active', 'organization.archived'],
    'archived': []
  } as Record<OrganizationState, string[]>,
  customers: {
    'active': ['customer.merged', 'customer.archived'],
    'merged': ['customer.archived'],
    'archived': []
  } as Record<CustomerState, string[]>,
  services: {
    'active': ['service.retired'],
    'retired': ['service.active']
  } as Record<ServiceState, string[]>
};

