import { CustomerDTO, RequestDTO, AgreementDTO, ServiceInstanceDTO } from './types';

// The hardcoded org used before auth integration (still used by mock fixtures)
const ORG_ID = '11111111-2222-3333-4444-555555555555';

// Realistic Studio Services
const SERVICES = {
  PASSPORT: '00000000-0000-0000-0000-000000000001',
  PORTRAIT: '00000000-0000-0000-0000-000000000002',
  WEDDING_TRADITIONAL: '00000000-0000-0000-0000-000000000003',
  WEDDING_WHITE: '00000000-0000-0000-0000-000000000004',
  PHOTOBOOK: '00000000-0000-0000-0000-000000000005',
  FRAME: '00000000-0000-0000-0000-000000000006'
};

// ---------------------------------------------------------
// Scenario 1: A Walk-in Passport Photograph
// ---------------------------------------------------------
const customerSopulu: CustomerDTO = {
  id: '22222222-0000-0000-0000-000000000001',
  organizationId: ORG_ID,
  primaryIdentifier: '+2348030000001',
  profileData: { name: 'Sopulu' },
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const reqPassport: RequestDTO = {
  id: 'req-passport-001',
  organizationId: ORG_ID,
  customerId: customerSopulu.id,
  requestedServices: { serviceId: SERVICES.PASSPORT, name: 'Walk-in Passport' },
  status: 'accepted',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const agrPassport: AgreementDTO = {
  id: 'agr-passport-001',
  organizationId: ORG_ID,
  customerId: customerSopulu.id,
  requestId: reqPassport.id,
  status: 'active',
  terms: { price: 5000, currency: 'NGN' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  request: reqPassport
};

const instPassport: ServiceInstanceDTO = {
  id: 'inst-passport-001',
  organizationId: ORG_ID,
  agreementId: agrPassport.id,
  serviceId: SERVICES.PASSPORT,
  status: 'completed',
  fulfillmentData: { origin: 'Walk-in' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------
// Scenario 2: Chidinma & Obi (Wedding + Photobook + Frame)
// ---------------------------------------------------------
const customerWedding: CustomerDTO = {
  id: '22222222-0000-0000-0000-000000000002',
  organizationId: ORG_ID,
  primaryIdentifier: '+2348050000002',
  profileData: { name: 'Chidinma & Obi' },
  status: 'active',
  createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  updatedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
};

const reqWedding: RequestDTO = {
  id: 'req-wedding-001',
  organizationId: ORG_ID,
  customerId: customerWedding.id,
  requestedServices: { 
    serviceId: SERVICES.WEDDING_WHITE, 
    name: 'White Wedding Coverage + Extras' 
  },
  status: 'accepted',
  createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  updatedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
};

const agrWedding: AgreementDTO = {
  id: 'agr-wedding-001',
  organizationId: ORG_ID,
  customerId: customerWedding.id,
  requestId: reqWedding.id,
  status: 'active',
  terms: { price: 735000, currency: 'NGN', note: 'Wedding + Photobook + Frame Package' },
  createdAt: new Date(Date.now() - 86400000 * 28).toISOString(),
  updatedAt: new Date(Date.now() - 86400000 * 28).toISOString(),
  request: reqWedding
};

const instWeddingEvent: ServiceInstanceDTO = {
  id: 'inst-wedding-001',
  organizationId: ORG_ID,
  agreementId: agrWedding.id,
  serviceId: SERVICES.WEDDING_WHITE,
  status: 'delivered',
  fulfillmentData: { location: 'Lagos Island', date: new Date(Date.now() - 86400000 * 7).toISOString() },
  createdAt: new Date(Date.now() - 86400000 * 28).toISOString(),
  updatedAt: new Date(Date.now() - 86400000 * 28).toISOString(),
};

const instPhotobook: ServiceInstanceDTO = {
  id: 'inst-wedding-002',
  organizationId: ORG_ID,
  agreementId: agrWedding.id,
  serviceId: SERVICES.PHOTOBOOK,
  status: 'in_progress',
  fulfillmentData: { pages: 40, cover: 'Synthetic', note: 'Awaiting design approval' },
  createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
  updatedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
};

const instFrame: ServiceInstanceDTO = {
  id: 'inst-wedding-003',
  organizationId: ORG_ID,
  agreementId: agrWedding.id,
  serviceId: SERVICES.FRAME,
  status: 'waiting', // Waiting for client to select the picture
  fulfillmentData: { size: '24x36', type: 'Canvas', note: 'Client to pick favorite shot' },
  createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
  updatedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
};

export const MockScenarios = {
  SERVICES,
  passport: {
    customer: customerSopulu,
    request: reqPassport,
    agreement: agrPassport,
    instance: instPassport
  },
  wedding: {
    customer: customerWedding,
    request: reqWedding,
    agreement: agrWedding,
    instances: [instWeddingEvent, instPhotobook, instFrame]
  }
};
