import { Database } from '@/lib/database.types';

export type Json = Database['public']['Tables']['customers']['Row']['profile_data'];

export type RequestState = 'created' | 'reviewed' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
export type AgreementState = 'proposed' | 'active' | 'modified' | 'fulfilled' | 'closed' | 'cancelled' | 'disputed';
export type InstanceState = 'created' | 'scheduled' | 'in_progress' | 'waiting' | 'completed' | 'delivered' | 'archived' | 'halted' | 'accepted' | 'revised';
export type AssetState = 'registered' | 'consumed' | 'archived';

export interface OrganizationDTO {
  id: string;
  name: string;
  status: string; // active, archived, etc.
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
  status: string; // active, retired
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDTO {
  id: string;
  organizationId: string;
  primaryIdentifier: string;
  profileData: Record<string, any>;
  status: string;
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
