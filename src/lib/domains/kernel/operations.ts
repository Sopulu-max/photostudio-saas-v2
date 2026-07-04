import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { KernelRepository } from './repository';
import { 
  LEGAL_TRANSITIONS, 
  RequestState, 
  AgreementState,
  InstanceState,
  AssetState,
  OrganizationState,
  CustomerState,
  ServiceState,
  ServiceInstanceDTO
} from './types';

export class KernelOperations {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly repo: KernelRepository
  ) {}

  /**
   * Helper to execute a state transition via the events table.
   * The database trigger `update_entity_status_from_event` handles the actual status update.
   */
  private async executeTransition(
    orgId: string,
    entityType: 'request' | 'agreement' | 'service_instance' | 'asset' | 'organization' | 'customer' | 'service',
    entityId: string,
    currentState: string,
    eventSuffix: string,
    payload: any = {},
    actorId?: string
  ): Promise<boolean> {
    const eventType = `${entityType}.${eventSuffix}`;
    const allowedEvents = LEGAL_TRANSITIONS[entityType + 's']?.[currentState] || [];
    
    // Bypass transition check for events that don't represent a status (like agreement.modified)
    if (eventType !== 'agreement.modified' && !allowedEvents.includes(eventType)) {
      throw new Error(`ILLEGAL_TRANSITION: Cannot apply event ${eventType} to ${entityType} in state ${currentState}`);
    }

    const { error } = await this.supabase
      .from('events')
      .insert({
        organization_id: orgId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        actor_id: actorId,
        payload: payload
      });

    if (error) {
      console.error('Transition failed:', error);
      throw new Error(`Failed to apply transition ${eventType}: ${error.message}`);
    }

    return true;
  }

  // --- Customer Operations ---
  
  async createCustomer(orgId: string, primaryIdentifier: string, profileData: any): Promise<string> {
    const { data: existing } = await this.supabase
      .from('customers')
      .select('id')
      .eq('organization_id', orgId)
      .eq('primary_identifier', primaryIdentifier)
      .single();
      
    if (existing) return existing.id;

    const { data, error } = await this.supabase
      .from('customers')
      .insert({
        organization_id: orgId,
        primary_identifier: primaryIdentifier,
        profile_data: profileData,
        status: 'active'
      })
      .select('id')
      .single();
    
    if (error || !data) throw new Error('Failed to create customer');
    return data.id;
  }

  // --- Request Operations ---

  async submitRequest(orgId: string, customerId: string, requestedServices: any, actorId?: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('requests')
      .insert({
        organization_id: orgId,
        customer_id: customerId,
        requested_services: requestedServices,
        status: 'created'
      })
      .select('id')
      .single();

    if (error || !data) throw new Error('Failed to submit request');

    await this.supabase.from('events').insert([
      { organization_id: orgId, entity_type: 'request', entity_id: data.id, event_type: 'request.created', actor_id: actorId, payload: {} }
    ]);

    return data.id;
  }

  async resolveRequest(orgId: string, reqId: string, action: 'accept' | 'decline' | 'withdraw' | 'expire', actorId?: string): Promise<boolean> {
    const req = await this.repo.getRequest(reqId);
    if (!req) throw new Error('Request not found');
    if (req.organizationId !== orgId) throw new Error('Tenancy violation');

    let eventSuffix = '';
    switch (action) {
      case 'accept': eventSuffix = 'accepted'; break;
      case 'decline': eventSuffix = 'declined'; break;
      case 'withdraw': eventSuffix = 'withdrawn'; break;
      case 'expire': eventSuffix = 'expired'; break;
    }

    return this.executeTransition(orgId, 'request', reqId, req.status, eventSuffix, {}, actorId);
  }

  // --- Agreement Operations ---

  async proposeAgreement(orgId: string, customerId: string, requestId: string | null, terms: any, actorId?: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('agreements')
      .insert({
        organization_id: orgId,
        customer_id: customerId,
        request_id: requestId,
        terms: terms,
        status: 'proposed'
      })
      .select('id')
      .single();

    if (error || !data) throw new Error('Failed to propose agreement');

    await this.supabase.from('events').insert([
      { organization_id: orgId, entity_type: 'agreement', entity_id: data.id, event_type: 'agreement.proposed', actor_id: actorId, payload: {} }
    ]);

    return data.id;
  }

  async activateAgreement(orgId: string, agrId: string, actorId?: string): Promise<boolean> {
    const agr = await this.repo.getAgreementWithGraph(agrId);
    if (!agr) throw new Error('Agreement not found');
    if (agr.organizationId !== orgId) throw new Error('Tenancy violation');

    // 1. Transition the agreement
    await this.executeTransition(orgId, 'agreement', agrId, agr.status, 'active', {}, actorId);

    // 2. Spawn instances based on the requested services in the original request, or terms
    // The amendment dictates: "instance-creation authority via Agreement".
    // We look at agr.request.requestedServices or agr.terms.services to spawn instances.
    const servicesToSpawn: Array<{ serviceId: string, [key: string]: unknown }> = 
      (agr.terms.services as any) || (agr.request?.requestedServices) || [];

    for (const s of servicesToSpawn) {
      const { data: instance, error } = await this.supabase
        .from('service_instances')
        .insert({
          organization_id: orgId,
          agreement_id: agrId,
          service_id: s.serviceId,
          fulfillment_data: s,
          status: 'created'
        })
        .select('id')
        .single();
        
      if (!error && instance) {
        await this.supabase.from('events').insert({
          organization_id: orgId,
          entity_type: 'service_instance',
          entity_id: instance.id,
          event_type: 'service_instance.created',
          actor_id: actorId,
          payload: {}
        });
      }
    }

    return true;
  }

  async completeAgreement(orgId: string, agrId: string, actorId?: string): Promise<boolean> {
    const agr = await this.repo.getAgreementWithGraph(agrId);
    if (!agr) throw new Error('Agreement not found');
    return this.executeTransition(orgId, 'agreement', agrId, agr.status, 'completed', {}, actorId);
  }

  async modifyAgreement(orgId: string, agrId: string, changes: Record<string, any>, actorId?: string): Promise<boolean> {
    const agr = await this.repo.getAgreementWithGraph(agrId);
    if (!agr) throw new Error('Agreement not found');
    
    // agreement.modified is an event, but doesn't change status. 
    // It captures the version history.
    await this.executeTransition(orgId, 'agreement', agrId, agr.status, 'modified', { changes }, actorId);
    
    // Apply changes to terms
    await this.supabase.from('agreements').update({
      terms: { ...agr.terms, ...changes }
    }).eq('id', agrId);

    return true;
  }

  async cancelAgreement(orgId: string, agrId: string, reason: string, actorId?: string): Promise<boolean> {
    const agr = await this.repo.getAgreementWithGraph(agrId);
    if (!agr) throw new Error('Agreement not found');
    
    await this.executeTransition(orgId, 'agreement', agrId, agr.status, 'cancelled', { reason }, actorId);
    
    // Halt all active instances per the law
    if (agr.instances) {
      for (const inst of agr.instances) {
        if (['created', 'scheduled', 'in_progress', 'waiting'].includes(inst.status)) {
          await this.executeTransition(orgId, 'service_instance', inst.id, inst.status, 'cancelled', { reason: 'Agreement cancelled' }, actorId);
        }
      }
    }
    return true;
  }

  // --- Service Operations ---

  async defineService(orgId: string, data: { name: string, description?: string, pricingRules?: any, requiredFields?: any }): Promise<string> {
    const { data: service, error } = await this.supabase
      .from('services')
      .insert({
        organization_id: orgId,
        name: data.name,
        description: data.description,
        pricing_rules: data.pricingRules || {},
        required_fields: data.requiredFields || {},
        status: 'active'
      })
      .select('id')
      .single();

    if (error || !service) throw new Error('Failed to define service');
    return service.id;
  }

  async retireService(orgId: string, serviceId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('services')
      .update({ status: 'retired' })
      .eq('id', serviceId)
      .eq('organization_id', orgId);

    if (error) throw new Error('Failed to retire service');
    return true;
  }

  // --- Asset & Outcome Operations ---

  async registerAsset(orgId: string, data: { customerId: string, contentReference: string }): Promise<string> {
    const { data: asset, error } = await this.supabase
      .from('assets')
      .insert({
        organization_id: orgId,
        origin_type: 'provided',
        origin_customer_id: data.customerId,
        content_reference: data.contentReference,
        status: 'registered'
      })
      .select('id')
      .single();

    if (error || !asset) throw new Error('Failed to register asset');
    
    await this.supabase.from('events').insert({
      organization_id: orgId,
      entity_type: 'asset',
      entity_id: asset.id,
      event_type: 'asset.registered',
      payload: {}
    });

    return asset.id;
  }

  async produceOutcome(orgId: string, instanceId: string, data: { contentReference: string }): Promise<string> {
    const { data: asset, error } = await this.supabase
      .from('assets')
      .insert({
        organization_id: orgId,
        origin_type: 'produced',
        origin_instance_id: instanceId,
        content_reference: data.contentReference,
        status: 'registered'
      })
      .select('id')
      .single();

    if (error || !asset) throw new Error('Failed to produce outcome');
    
    await this.supabase.from('events').insert({
      organization_id: orgId,
      entity_type: 'asset',
      entity_id: asset.id,
      event_type: 'outcome.produced', // Using outcome semantics for produced assets
      payload: {}
    });

    return asset.id;
  }

  async deliverOutcome(orgId: string, assetId: string, actorId?: string): Promise<boolean> {
    // Deliver outcome is essentially releasing it to the customer. We will transition to 'released'.
    const { data: asset, error } = await this.supabase.from('assets').select('status').eq('id', assetId).single();
    if (error || !asset) throw new Error('Asset not found');

    // Emit event, trigger changes status to released
    await this.executeTransition(orgId, 'asset', assetId, asset.status, 'released', {}, actorId);
    return true;
  }

  async setAssetRetention(orgId: string, assetId: string, policy: string, actorId?: string): Promise<boolean> {
    const { data: asset, error } = await this.supabase.from('assets').select('status').eq('id', assetId).single();
    if (error || !asset) throw new Error('Asset not found');

    await this.executeTransition(orgId, 'asset', assetId, asset.status, 'retained', { policy }, actorId);
    return true;
  }

  async transitionInstance(orgId: string, instanceId: string, eventSuffix: string, actorId?: string): Promise<boolean> {
    const { data: instance, error } = await this.supabase
      .from('service_instances')
      .select('status')
      .eq('id', instanceId)
      .single();
      
    if (error || !instance) throw new Error('Instance not found');
    
    return this.executeTransition(orgId, 'service_instance', instanceId, instance.status, eventSuffix, {}, actorId);
  }

  // --- Identity Operations ---

  async enrichIdentity(orgId: string, data: { name?: string, logoUrl?: string, brandColors?: any, typography?: any, contactData?: any }): Promise<boolean> {
    const updatePayload: any = {};
    if (data.name) updatePayload.name = data.name;
    if (data.logoUrl !== undefined) updatePayload.logo_url = data.logoUrl;
    if (data.brandColors) updatePayload.brand_colors = data.brandColors;
    if (data.typography) updatePayload.typography = data.typography;
    if (data.contactData) updatePayload.contact_data = data.contactData;

    const { error } = await this.supabase
      .from('identities')
      .update(updatePayload)
      .eq('organization_id', orgId);

    if (error) throw new Error('Failed to enrich identity');
    return true;
  }

  async mergeCustomers(orgId: string, primaryId: string, secondaryId: string): Promise<boolean> {
    // Repoint requests
    await this.supabase.from('requests').update({ customer_id: primaryId }).eq('customer_id', secondaryId).eq('organization_id', orgId);
    // Repoint agreements
    await this.supabase.from('agreements').update({ customer_id: primaryId }).eq('customer_id', secondaryId).eq('organization_id', orgId);
    // Repoint assets
    await this.supabase.from('assets').update({ origin_customer_id: primaryId }).eq('origin_customer_id', secondaryId).eq('organization_id', orgId);
    
    // Mark secondary as merged
    const { error } = await this.supabase.from('customers').update({ status: 'merged' }).eq('id', secondaryId).eq('organization_id', orgId);
    if (error) throw new Error('Failed to merge customers');
    
    return true;
  }

  async createOrganization(data: { name: string, ownerId: string }): Promise<string> {
    // We would need to create the org, the identity, and the membership.
    // Assuming we do this as an admin client or bypass RLS if the user is creating it for themselves.
    const { data: org, error } = await this.supabase
      .from('organizations')
      .insert({ name: data.name, status: 'active' })
      .select('id')
      .single();

    if (error || !org) throw new Error('Failed to create organization');

    await this.supabase.from('identities').insert({
      organization_id: org.id,
      name: data.name,
      brand_colors: {},
      typography: {},
      contact_data: {}
    });

    // Typically you'd also create a membership here in a real app:
    // await this.supabase.from('memberships').insert({ organization_id: org.id, user_id: data.ownerId, role: 'owner' });

    return org.id;
  }
}
