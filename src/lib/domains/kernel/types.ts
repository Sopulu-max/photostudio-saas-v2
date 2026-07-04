import { Database } from '@/lib/database.types';

export type Json = Database['public']['Tables']['customers']['Row']['profile_data'];

export type RequestState = 'open' | 'accepted' | 'rejected' | 'expired'; // Based on prior knowledge + user: "already right in the DB"
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
  brandColors: Record<string, any>;
  typography: Record<string, any>;
  contactData: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceDTO {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  pricingRules: Record<string, any>;
  requiredFields: Record<string, any>;
  status: ServiceState;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDTO {
  id: string;
  organizationId: string;
  primaryIdentifier: string;
  profileData: Record<string, any>;
  status: CustomerState;
  createdAt: string;
  updatedAt: string;
}

export interface RequestDTO {
  id: string;
  organizationId: string;
  customerId: string;
  requestedServices: Record<string, any>;
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
  fulfillmentData: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface AgreementDTO {
  id: string;
  organizationId: string;
  customerId: string;
  requestId: string | null;
  status: AgreementState;
  terms: Record<string, any>;
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
    'active': ['agreement.completed', 'agreement.cancelled', 'agreement.modified'], // modified doesn't change state but is legal to emit
    'completed': ['agreement.archived'],
    'cancelled': []
  },
  requests: {
    'open': ['request.accepted', 'request.rejected', 'request.expired'],
    'accepted': [],
    'rejected': [],
    'expired': []
  }
};

