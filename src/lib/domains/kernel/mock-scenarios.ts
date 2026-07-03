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

// --- Scenario 3: Framing Years Later ---
export const FramingRequest: RequestDTO = {
  id: 'req-framing-01',
  organizationId: ORG_ID,
  customerId: WeddingCustomer.id,
  requestedServices: { serviceId: 'svc-framing', name: 'Frame old photo' },
  status: 'accepted',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const FramingAgreement: AgreementDTO = {
  id: 'agr-framing-01',
  organizationId: ORG_ID,
  customerId: WeddingCustomer.id,
  requestId: FramingRequest.id,
  status: 'active',
  terms: { price: 50000, currency: 'NGN' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const FramingInstance: ServiceInstanceDTO = {
  id: 'inst-framing-01',
  organizationId: ORG_ID,
  agreementId: FramingAgreement.id,
  serviceId: 'svc-framing',
  status: 'in_progress',
  fulfillmentData: { sourceAssetId: 'archived-wedding-photo-id' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// --- Scenario 4: Partial Cancellation ---
export const CancelRequest: RequestDTO = {
  id: 'req-cancel-01',
  organizationId: ORG_ID,
  customerId: SopuluCustomer.id,
  requestedServices: { name: 'Double Portrait' },
  status: 'accepted',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const CancelAgreement: AgreementDTO = {
  id: 'agr-cancel-01',
  organizationId: ORG_ID,
  customerId: SopuluCustomer.id,
  requestId: CancelRequest.id,
  status: 'active',
  terms: { price: 100000 },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const CancelInstance1: ServiceInstanceDTO = {
  id: 'inst-cancel-1',
  organizationId: ORG_ID,
  agreementId: CancelAgreement.id,
  serviceId: 'svc-portrait',
  status: 'completed',
  fulfillmentData: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const CancelInstance2: ServiceInstanceDTO = {
  id: 'inst-cancel-2',
  organizationId: ORG_ID,
  agreementId: CancelAgreement.id,
  serviceId: 'svc-portrait',
  status: 'halted',
  fulfillmentData: { reason: 'Client left early' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// --- Scenario 5: Provided Asset Print Job ---
export const PrintRequest: RequestDTO = {
  id: 'req-print-01',
  organizationId: ORG_ID,
  customerId: SopuluCustomer.id,
  requestedServices: { name: 'Print from USB' },
  status: 'accepted',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const PrintAgreement: AgreementDTO = {
  id: 'agr-print-01',
  organizationId: ORG_ID,
  customerId: SopuluCustomer.id,
  requestId: PrintRequest.id,
  status: 'active',
  terms: { price: 5000 },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const PrintInstance: ServiceInstanceDTO = {
  id: 'inst-print-01',
  organizationId: ORG_ID,
  agreementId: PrintAgreement.id,
  serviceId: 'svc-print',
  status: 'waiting',
  fulfillmentData: { clientProvidedAsset: true },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// --- Scenario 6: White-Label Seam ---
export const WhiteLabelRequest: RequestDTO = {
  id: 'req-wl-01',
  organizationId: ORG_ID,
  customerId: 'cust-agency-01', // B2B Agency
  requestedServices: { name: 'Corporate Headshots (White Label)' },
  status: 'accepted',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const WhiteLabelAgreement: AgreementDTO = {
  id: 'agr-wl-01',
  organizationId: ORG_ID,
  customerId: 'cust-agency-01',
  requestId: WhiteLabelRequest.id,
  status: 'active',
  terms: { price: 200000, whiteLabel: true },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const WhiteLabelInstance: ServiceInstanceDTO = {
  id: 'inst-wl-01',
  organizationId: ORG_ID,
  agreementId: WhiteLabelAgreement.id,
  serviceId: 'svc-headshot',
  status: 'scheduled',
  fulfillmentData: { externalOrganizationId: 'org-agency-01' },
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
  },
  framingYearsLater: {
    customer: WeddingCustomer,
    request: FramingRequest,
    agreement: FramingAgreement,
    instance: FramingInstance
  },
  partialCancellation: {
    customer: SopuluCustomer,
    request: CancelRequest,
    agreement: CancelAgreement,
    instances: [CancelInstance1, CancelInstance2]
  },
  providedAssetPrint: {
    customer: SopuluCustomer,
    request: PrintRequest,
    agreement: PrintAgreement,
    instance: PrintInstance
  },
  whiteLabelSeam: {
    request: WhiteLabelRequest,
    agreement: WhiteLabelAgreement,
    instance: WhiteLabelInstance
  }
};
