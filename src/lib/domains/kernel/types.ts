import { Database } from '@/lib/database.types';

export type Json = Database['public']['Tables']['customers']['Row']['profile_data'];

export interface OrganizationDTO {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  archivedAt: string | null;
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
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceInstanceDTO {
  id: string;
  organizationId: string;
  agreementId: string;
  serviceId: string;
  status: string;
  fulfillmentData: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface AgreementDTO {
  id: string;
  organizationId: string;
  requestId: string;
  status: string;
  terms: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  
  // Relations
  request?: RequestDTO;
  instances?: ServiceInstanceDTO[];
}
