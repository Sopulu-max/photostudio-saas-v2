import { CustomerDTO, RequestDTO, AgreementDTO, ServiceInstanceDTO } from './types';

// The hardcoded org used before auth integration (still used by mock fixtures)
const ORG_ID = '11111111-2222-3333-4444-555555555555';

// Deterministic Dates for Stable Rendering
const NOW = '2026-07-08T12:00:00.000Z';
const MINUS_7 = '2026-07-01T12:00:00.000Z';
const MINUS_28 = '2026-06-10T12:00:00.000Z';
const MINUS_30 = '2026-06-08T12:00:00.000Z';

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
  createdAt: NOW,
  updatedAt: NOW,
};

const reqPassport: RequestDTO = {
  id: 'req-passport-001',
  organizationId: ORG_ID,
  customerId: customerSopulu.id,
  requestedServices: [
    { serviceId: SERVICES.PASSPORT }
  ] as any,
  status: 'accepted',
  createdAt: NOW,
  updatedAt: NOW,
};

const agrPassport: AgreementDTO = {
  id: 'agr-passport-001',
  organizationId: ORG_ID,
  customerId: customerSopulu.id,
  requestId: reqPassport.id,
  status: 'active',
  terms: { price: 5000, currency: 'NGN' },
  createdAt: NOW,
  updatedAt: NOW,
  request: reqPassport
};

const instPassport: ServiceInstanceDTO = {
  id: 'inst-passport-001',
  organizationId: ORG_ID,
  agreementId: agrPassport.id,
  serviceId: SERVICES.PASSPORT,
  status: 'completed',
  fulfillmentData: { origin: 'Walk-in' },
  createdAt: NOW,
  updatedAt: NOW,
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
  createdAt: MINUS_30,
  updatedAt: MINUS_30,
};

const reqWedding: RequestDTO = {
  id: 'req-wedding-001',
  organizationId: ORG_ID,
  customerId: customerWedding.id,
  requestedServices: [
    { serviceId: SERVICES.WEDDING_WHITE }
  ] as any,
  status: 'accepted',
  createdAt: MINUS_30,
  updatedAt: MINUS_30,
};

const agrWedding: AgreementDTO = {
  id: 'agr-wedding-001',
  organizationId: ORG_ID,
  customerId: customerWedding.id,
  requestId: reqWedding.id,
  status: 'active',
  terms: { price: 735000, currency: 'NGN', note: 'Wedding + Photobook + Frame Package' },
  createdAt: MINUS_28,
  updatedAt: MINUS_28,
  request: reqWedding
};

const instWeddingEvent: ServiceInstanceDTO = {
  id: 'inst-wedding-001',
  organizationId: ORG_ID,
  agreementId: agrWedding.id,
  serviceId: SERVICES.WEDDING_WHITE,
  status: 'delivered',
  fulfillmentData: { location: 'Lagos Island', date: MINUS_7 },
  createdAt: MINUS_28,
  updatedAt: MINUS_28,
};

const instPhotobook: ServiceInstanceDTO = {
  id: 'inst-wedding-002',
  organizationId: ORG_ID,
  agreementId: agrWedding.id,
  serviceId: SERVICES.PHOTOBOOK,
  status: 'in_progress',
  fulfillmentData: { pages: 40, cover: 'Synthetic', note: 'Awaiting design approval' },
  createdAt: MINUS_7,
  updatedAt: MINUS_7,
};

const instFrame: ServiceInstanceDTO = {
  id: 'inst-wedding-003',
  organizationId: ORG_ID,
  agreementId: agrWedding.id,
  serviceId: SERVICES.FRAME,
  status: 'waiting', // Waiting for client to select the picture
  fulfillmentData: { size: '24x36', type: 'Canvas', note: 'Client to pick favorite shot' },
  createdAt: MINUS_7,
  updatedAt: MINUS_7,
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
