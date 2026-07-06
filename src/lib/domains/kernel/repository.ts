import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { 
  OrganizationDTO, 
  CustomerDTO, 
  RequestDTO, 
  AgreementDTO, 
  ServiceInstanceDTO,
  IdentityDTO,
  ServiceDTO,
  AssetDTO,
  RequestState,
  AgreementState,
  InstanceState,
  AssetState,
  OrganizationState,
  CustomerState,
  ServiceState,
  LEGAL_TRANSITIONS
} from './types';

export class KernelRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  // --- Mappers ---
  // Enforces the strict boundary. Raw rows never leak to the UI.

  private mapOrganization(row: Database['public']['Tables']['organizations']['Row']): OrganizationDTO {
    return {
      id: row.id,
      name: row.name,
      status: row.status as OrganizationState,
      createdAt: row.created_at,
      archivedAt: row.archived_at,
    };
  }

  private mapIdentity(row: Database['public']['Tables']['identities']['Row']): IdentityDTO {
    return {
      organizationId: row.organization_id,
      name: row.name,
      logoUrl: row.logo_url,
      brandColors: (row.brand_colors as Record<string, any>) || {},
      typography: (row.typography as Record<string, any>) || {},
      contactData: (row.contact_data as Record<string, any>) || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapService(row: Database['public']['Tables']['services']['Row']): ServiceDTO {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      pricingRules: (row.pricing_rules as Record<string, any>) || {},
      requiredFields: (row.required_fields as Record<string, any>) || {},
      status: row.status as ServiceState,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapCustomer(row: Database['public']['Tables']['customers']['Row']): CustomerDTO {
    return {
      id: row.id,
      organizationId: row.organization_id,
      primaryIdentifier: row.primary_identifier,
      profileData: (row.profile_data as Record<string, any>) || {},
      status: row.status as CustomerState,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRequest(row: Database['public']['Tables']['requests']['Row']): RequestDTO {
    return {
      id: row.id,
      organizationId: row.organization_id,
      customerId: row.customer_id,
      requestedServices: (row.requested_services as unknown as any[]) || [],
      status: row.status as RequestState,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapServiceInstance(row: Database['public']['Tables']['service_instances']['Row']): ServiceInstanceDTO {
    return {
      id: row.id,
      organizationId: row.organization_id,
      agreementId: row.agreement_id,
      serviceId: row.service_id,
      status: row.status as InstanceState,
      fulfillmentData: (row.fulfillment_data as Record<string, any>) || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapAgreement(row: any): AgreementDTO {
    const instancesRaw = Array.isArray(row.service_instances) 
      ? row.service_instances 
      : (row.service_instances ? [row.service_instances] : []);
      
    const requestRaw = Array.isArray(row.requests) ? row.requests[0] : row.requests;

    return {
      id: row.id,
      organizationId: row.organization_id,
      customerId: row.customer_id,
      requestId: row.request_id,
      status: row.status as AgreementState,
      terms: (row.terms as Record<string, any>) || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      request: requestRaw ? this.mapRequest(requestRaw) : undefined,
      instances: instancesRaw.map((i: any) => this.mapServiceInstance(i)),
    };
  }

  private mapAsset(row: Database['public']['Tables']['assets']['Row']): AssetDTO {
    return {
      id: row.id,
      organizationId: row.organization_id,
      originType: row.origin_type as 'produced' | 'provided',
      originInstanceId: row.origin_instance_id,
      originCustomerId: row.origin_customer_id,
      contentReference: row.content_reference,
      status: row.status as AssetState,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }


  // --- Queries (Fetchers) ---

  async getServicesByOrganization(orgId: string): Promise<ServiceDTO[]> {
    const { data, error } = await this.supabase
      .from('services')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'active');
      
    if (error) throw error;
    return (data || []).map(row => this.mapService(row));
  }

  async getOrganization(id: string): Promise<OrganizationDTO | null> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return this.mapOrganization(data);
  }

  async getCustomer(id: string): Promise<CustomerDTO | null> {
    const { data, error } = await this.supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return this.mapCustomer(data);
  }

  async getRequest(id: string): Promise<RequestDTO | null> {
    const { data, error } = await this.supabase
      .from('requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return this.mapRequest(data);
  }

  /**
   * Fetches an agreement and its immediate graph (the Request that spawned it, 
   * and the Service Instances it contains).
   */
  async getAgreementWithGraph(id: string): Promise<AgreementDTO | null> {
    const { data, error } = await this.supabase
      .from('agreements')
      .select(`
        *,
        requests(*),
        service_instances(*)
      `)
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return this.mapAgreement(data);
  }

  // --- Collection Fetchers ---

  async getInstancesByOrganization(orgId: string): Promise<ServiceInstanceDTO[]> {
    const { data, error } = await this.supabase
      .from('service_instances')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(row => this.mapServiceInstance(row));
  }

  async getAgreementsByOrganization(orgId: string): Promise<AgreementDTO[]> {
    const { data, error } = await this.supabase
      .from('agreements')
      .select(`
        *,
        requests(*),
        service_instances(*)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(row => this.mapAgreement(row));
  }

}
