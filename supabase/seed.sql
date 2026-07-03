-- Seed Script for Photostudio SaaS
-- This seeds the exact entities from mock-scenarios.ts into the database for Phase 4 UI testing.

-- Organization
INSERT INTO public.organizations (id, name, status) 
VALUES ('11111111-2222-3333-4444-555555555555', 'Test Studio', 'active')
ON CONFLICT (id) DO NOTHING;

-- Service Definitions
INSERT INTO public.services (id, organization_id, name) VALUES 
('00000000-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555', 'Passport Photo'),
('00000000-0000-0000-0000-000000000002', '11111111-2222-3333-4444-555555555555', 'Pre-wedding'),
('00000000-0000-0000-0000-000000000003', '11111111-2222-3333-4444-555555555555', 'Wedding Event'),
('00000000-0000-0000-0000-000000000004', '11111111-2222-3333-4444-555555555555', 'Photobook')
ON CONFLICT (id) DO NOTHING;

-- Customers
-- Sopulu
INSERT INTO public.customers (id, organization_id, primary_identifier, profile_data, status) VALUES
('22222222-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555', '+2348000000001', '{"name": "Sopulu (Walk-in)"}', 'active')
ON CONFLICT (id) DO NOTHING;

-- Wedding
INSERT INTO public.customers (id, organization_id, primary_identifier, profile_data, status) VALUES
('22222222-0000-0000-0000-000000000002', '11111111-2222-3333-4444-555555555555', 'bride@example.com', '{"name": "Chidinma & Obi"}', 'active')
ON CONFLICT (id) DO NOTHING;

-- Requests
-- Sopulu Request
INSERT INTO public.requests (id, organization_id, customer_id, requested_services, status) VALUES
('33333333-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555', '22222222-0000-0000-0000-000000000001', '{"serviceId": "00000000-0000-0000-0000-000000000001", "name": "Passport Photo"}', 'proposed')
ON CONFLICT (id) DO NOTHING;

-- Wedding Request
INSERT INTO public.requests (id, organization_id, customer_id, requested_services, status) VALUES
('33333333-0000-0000-0000-000000000002', '11111111-2222-3333-4444-555555555555', '22222222-0000-0000-0000-000000000002', '{"package": "Gold Wedding", "items": ["Pre-wedding", "Main Event", "Photobook"]}', 'proposed')
ON CONFLICT (id) DO NOTHING;

-- Agreements
-- Sopulu Agreement
INSERT INTO public.agreements (id, organization_id, customer_id, request_id, status, terms) VALUES
('44444444-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'active', '{"price": 2000, "currency": "NGN", "verbal": true}')
ON CONFLICT (id) DO NOTHING;

-- Wedding Agreement
INSERT INTO public.agreements (id, organization_id, customer_id, request_id, status, terms) VALUES
('44444444-0000-0000-0000-000000000002', '11111111-2222-3333-4444-555555555555', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002', 'active', '{"price": 500000, "currency": "NGN", "contractSigned": true}')
ON CONFLICT (id) DO NOTHING;

-- Service Instances
-- Sopulu Instance
INSERT INTO public.service_instances (id, organization_id, agreement_id, service_id, status) VALUES
('55555555-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555', '44444444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'completed')
ON CONFLICT (id) DO NOTHING;

-- Wedding Instances
INSERT INTO public.service_instances (id, organization_id, agreement_id, service_id, status) VALUES
('55555555-0000-0000-0000-000000000002', '11111111-2222-3333-4444-555555555555', '44444444-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'completed'),
('55555555-0000-0000-0000-000000000003', '11111111-2222-3333-4444-555555555555', '44444444-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'waiting'),
('55555555-0000-0000-0000-000000000004', '11111111-2222-3333-4444-555555555555', '44444444-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'scheduled')
ON CONFLICT (id) DO NOTHING;
