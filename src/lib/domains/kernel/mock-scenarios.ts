import { CustomerDTO, RequestDTO, AgreementDTO, ServiceInstanceDTO } from './types';

// We mock the DB UUIDs to be predictable for the fixtures
const ORG_ID = 'org-1111-2222-3333-4444';

// --- Scenario 1: Sopulu's Walk-in Passport Photo ---

export const SopuluCustomer: CustomerDTO = {
  id: 'cust-passport-01',
  organizationId: ORG_ID,
  primaryIdentifier: '+2348000000001',
  profileData: { name: 'Sopulu (Walk-in)' },
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const SopuluRequest: RequestDTO = {
  id: 'req-passport-01',
  organizationId: ORG_ID,
  customerId: SopuluCustomer.id,
  requestedServices: { serviceId: 'svc-passport', name: 'Passport Photo' },
  status: 'accepted',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const SopuluAgreement: AgreementDTO = {
  id: 'agr-passport-01',
  organizationId: ORG_ID,
  customerId: SopuluCustomer.id,
  requestId: SopuluRequest.id,
  status: 'active', // Valid Agreement Status
  terms: { price: 2000, currency: 'NGN', verbal: true },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const SopuluInstance: ServiceInstanceDTO = {
  id: 'inst-passport-01',
  organizationId: ORG_ID,
  agreementId: SopuluAgreement.id,
  serviceId: 'svc-passport',
  status: 'completed', // Valid Instance Status
  fulfillmentData: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// --- Scenario 2: The Wedding with 3 Instances ---

export const WeddingCustomer: CustomerDTO = {
  id: 'cust-wedding-01',
  organizationId: ORG_ID,
  primaryIdentifier: 'bride@example.com',
  profileData: { name: 'Chidinma & Obi' },
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const WeddingRequest: RequestDTO = {
  id: 'req-wedding-01',
  organizationId: ORG_ID,
  customerId: WeddingCustomer.id,
  requestedServices: { package: 'Gold Wedding', items: ['Pre-wedding', 'Main Event', 'Photobook'] },
  status: 'accepted',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const WeddingAgreement: AgreementDTO = {
  id: 'agr-wedding-01',
  organizationId: ORG_ID,
  customerId: WeddingCustomer.id,
  requestId: WeddingRequest.id,
  status: 'active', // Valid Agreement Status
  terms: { price: 500000, currency: 'NGN', contractSigned: true },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Three instances spawned from the one agreement
export const WeddingInstancePre: ServiceInstanceDTO = {
  id: 'inst-wedding-pre',
  organizationId: ORG_ID,
  agreementId: WeddingAgreement.id,
  serviceId: 'svc-prewedding',
  status: 'completed', // Valid Instance Status
  fulfillmentData: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const WeddingInstanceMain: ServiceInstanceDTO = {
  id: 'inst-wedding-main',
  organizationId: ORG_ID,
  agreementId: WeddingAgreement.id,
  serviceId: 'svc-wedding-event',
  status: 'waiting', // Valid Instance Status
  fulfillmentData: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const WeddingInstanceBook: ServiceInstanceDTO = {
  id: 'inst-wedding-book',
  organizationId: ORG_ID,
  agreementId: WeddingAgreement.id,
  serviceId: 'svc-photobook',
  status: 'scheduled', // Valid Instance Status
  fulfillmentData: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// We expose them all in a single mock graph for the UI to consume
export const MockScenarios = {
  passport: {
    customer: SopuluCustomer,
    request: SopuluRequest,
    agreement: SopuluAgreement,
    instance: SopuluInstance,
  },
  wedding: {
    customer: WeddingCustomer,
    request: WeddingRequest,
    agreement: WeddingAgreement,
    instances: [WeddingInstancePre, WeddingInstanceMain, WeddingInstanceBook]
  }
};
