-- Seed Script for Photostudio SaaS
-- Seeds the primal reality: a real photography studio in Nigeria, with actual services, real prices, and initial state.

-- The Org (Seed UUID matching what we used in the UI)
INSERT INTO public.organizations (id, name, status) 
VALUES ('11111111-2222-3333-4444-555555555555', 'Lumiere Studios Lagos', 'active')
ON CONFLICT (id) DO NOTHING;

-- Service Definitions (The Catalog)
-- Using actual Nigerian photography studio services with typical base prices (in Naira)
INSERT INTO public.services (id, organization_id, name, description, pricing_rules) VALUES 
('00000000-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555', 'Walk-in Passport Photo', 'Instant digital and physical passport photographs (6 copies)', '{"basePrice": 5000}'),
('00000000-0000-0000-0000-000000000002', '11111111-2222-3333-4444-555555555555', 'Studio Portrait Session', '1-hour indoor studio session, 10 retouched digital images', '{"basePrice": 50000}'),
('00000000-0000-0000-0000-000000000003', '11111111-2222-3333-4444-555555555555', 'Traditional Wedding Coverage', 'Full day coverage, 1 lead photographer, 1 assistant', '{"basePrice": 350000}'),
('00000000-0000-0000-0000-000000000004', '11111111-2222-3333-4444-555555555555', 'White Wedding Coverage', 'Full day coverage, bridal prep to reception, 2 photographers', '{"basePrice": 500000}'),
('00000000-0000-0000-0000-000000000005', '11111111-2222-3333-4444-555555555555', 'Photobook Printing (A3 Synthetic)', 'Premium A3 lay-flat synthetic photobook (40 pages)', '{"basePrice": 150000}'),
('00000000-0000-0000-0000-000000000006', '11111111-2222-3333-4444-555555555555', 'Wall Frame (24x36 Canvas)', 'Premium canvas wrapped wall frame', '{"basePrice": 85000}')
ON CONFLICT (id) DO NOTHING;

-- Customers (The initial reality state)
INSERT INTO public.customers (id, organization_id, primary_identifier, profile_data, status) VALUES
('22222222-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555', '+2348030000001', '{"name": "Sopulu"}', 'active'),
('22222222-0000-0000-0000-000000000002', '11111111-2222-3333-4444-555555555555', '+2348050000002', '{"name": "Chidinma & Obi"}', 'active')
ON CONFLICT (id) DO NOTHING;
