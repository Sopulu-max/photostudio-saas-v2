import { Database } from '@/lib/database.types';

export type Json = Database['public']['Tables']['customers']['Row']['profile_data'];

export type RequestState = 'created' | 'reviewed' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
export type AgreementState = 'proposed' | 'active' | 'completed' | 'cancelled';
export type InstanceState = 'created' | 'scheduled' | 'in_progress' | 'waiting' | 'completed' | 'delivered' | 'archived' | 'halted';
export type AssetState = 'registered' | 'available' | 'in_use' | 'retained' | 'released';

export type OrganizationState = 'created' | 'active' | 'suspended' | 'archived';
export type CustomerState = 'active' | 'merged' | 'archived';
export type ServiceState = 'active' | 'retired';

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

/**
 * Server-side truth for what events are legal from what states.
 * Used by the repository to throw ILLEGAL_TRANSITION.
 */
export const LEGAL_TRANSITIONS: Record<string, Record<string, string[]>> = {
  service_instances: {
    // currentState -> allowed events
    'created': ['service_instance.scheduled', 'service_instance.in_progress', 'service_instance.cancelled', 'service_instance.halted'],
    'scheduled': ['service_instance.in_progress', 'service_instance.waiting', 'service_instance.halted', 'service_instance.cancelled'],
    'in_progress': ['service_instance.completed', 'service_instance.waiting', 'service_instance.halted'],
    'waiting': ['service_instance.in_progress', 'service_instance.halted'],
    'halted': ['service_instance.in_progress', 'service_instance.scheduled', 'service_instance.cancelled'],
    'completed': ['service_instance.delivered', 'service_instance.archived'],
    'delivered': ['service_instance.archived'],
    'archived': []
  },
  agreements: {
    'proposed': ['agreement.active', 'agreement.cancelled'],
    'active': ['agreement.completed', 'agreement.cancelled'],
    'completed': ['agreement.archived'],
    'cancelled': []
  },
  requests: {
    'created': ['request.reviewed', 'request.accepted', 'request.declined', 'request.withdrawn', 'request.expired'],
    'reviewed': ['request.accepted', 'request.declined', 'request.withdrawn', 'request.expired'],
    'accepted': [],
    'declined': [],
    'withdrawn': [],
    'expired': []
  },
  assets: {
    'registered': ['asset.available', 'asset.in_use', 'asset.released'],
    'available': ['asset.in_use', 'asset.released'],
    'in_use': ['asset.retained', 'asset.released', 'asset.available'],
    'retained': ['asset.released'],
    'released': []
  }
};

