-- Phase 1: Semantic Plane (Dimensions & Outputs)
-- Add hierarchy to classification dimensions
ALTER TABLE occasions ADD COLUMN parent_id uuid REFERENCES occasions(id) ON DELETE CASCADE;
ALTER TABLE subjects ADD COLUMN parent_id uuid REFERENCES subjects(id) ON DELETE CASCADE;
ALTER TABLE service_contexts ADD COLUMN parent_id uuid REFERENCES service_contexts(id) ON DELETE CASCADE;
ALTER TABLE purposes ADD COLUMN parent_id uuid REFERENCES purposes(id) ON DELETE CASCADE;
ALTER TABLE client_types ADD COLUMN parent_id uuid REFERENCES client_types(id) ON DELETE CASCADE;

-- Rename deliverables to output_types (Semantic asset types)
ALTER TABLE deliverables RENAME TO output_types;
-- The RLS policies on deliverables will automatically carry over to the new table name in Postgres,
-- but they might still have names like "Users can view deliverables". That's fine.

-- Rename service_deliverables to service_outputs
ALTER TABLE service_deliverables RENAME TO service_outputs;
ALTER TABLE service_outputs RENAME COLUMN deliverable_id TO output_type_id;

-- Rename package_deliverables to package_outputs
ALTER TABLE package_deliverables RENAME TO package_outputs;
ALTER TABLE package_outputs RENAME COLUMN deliverable_id TO output_type_id;

-- Create delivery_containers
CREATE TABLE delivery_containers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(organization_id, name)
);
ALTER TABLE delivery_containers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their org delivery containers" ON delivery_containers FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "Users can insert their org delivery containers" ON delivery_containers FOR INSERT WITH CHECK (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "Users can update their org delivery containers" ON delivery_containers FOR UPDATE USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "Users can delete their org delivery containers" ON delivery_containers FOR DELETE USING (organization_id IN (SELECT auth_org_ids()));


-- Phase 2: Production Plane (Services & Workflows)

-- Remove flat 1:1 dimension links from services
ALTER TABLE services DROP COLUMN occasion_id;
ALTER TABLE services DROP COLUMN context_id;
ALTER TABLE services DROP COLUMN subject_id;
ALTER TABLE services DROP COLUMN purpose_id;
ALTER TABLE services DROP COLUMN client_type_id;

-- Add Production Graph edges to services
ALTER TABLE services ADD COLUMN required_input_type_id uuid REFERENCES output_types(id) ON DELETE SET NULL;
ALTER TABLE services ADD COLUMN primary_output_type_id uuid REFERENCES output_types(id) ON DELETE SET NULL;

-- Remove rigid workflow attachment
ALTER TABLE services DROP COLUMN default_blueprint_id;

-- Add Production Graph edges to workflows (blueprints)
ALTER TABLE blueprints ADD COLUMN required_input_type_id uuid REFERENCES output_types(id) ON DELETE SET NULL;

-- Create Configuration Schema junction tables (What a service understands)
CREATE TABLE service_schema_occasions (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_id uuid REFERENCES services(id) ON DELETE CASCADE,
    occasion_id uuid REFERENCES occasions(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, occasion_id)
);
CREATE TABLE service_schema_contexts (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_id uuid REFERENCES services(id) ON DELETE CASCADE,
    context_id uuid REFERENCES service_contexts(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, context_id)
);
CREATE TABLE service_schema_subjects (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_id uuid REFERENCES services(id) ON DELETE CASCADE,
    subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, subject_id)
);
CREATE TABLE service_schema_purposes (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_id uuid REFERENCES services(id) ON DELETE CASCADE,
    purpose_id uuid REFERENCES purposes(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, purpose_id)
);
CREATE TABLE service_schema_client_types (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_id uuid REFERENCES services(id) ON DELETE CASCADE,
    client_type_id uuid REFERENCES client_types(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, client_type_id)
);

-- Enable RLS for service schemas
ALTER TABLE service_schema_occasions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_schema_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_schema_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_schema_purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_schema_client_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View service schemas" ON service_schema_occasions FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "View service schemas" ON service_schema_contexts FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "View service schemas" ON service_schema_subjects FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "View service schemas" ON service_schema_purposes FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "View service schemas" ON service_schema_client_types FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));


-- Phase 3: Commercial Plane (Packages)

-- Package Workflows
CREATE TABLE package_workflows (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    package_id uuid REFERENCES packages(id) ON DELETE CASCADE,
    blueprint_id uuid REFERENCES blueprints(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, blueprint_id)
);
ALTER TABLE package_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View package workflows" ON package_workflows FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));

-- Package Delivery Containers
CREATE TABLE package_delivery_containers (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    package_id uuid REFERENCES packages(id) ON DELETE CASCADE,
    container_id uuid REFERENCES delivery_containers(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, container_id)
);
ALTER TABLE package_delivery_containers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View package delivery containers" ON package_delivery_containers FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));

-- Restore Package Configurations (Locking in dimensions)
CREATE TABLE package_occasions (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    package_id uuid REFERENCES packages(id) ON DELETE CASCADE,
    occasion_id uuid REFERENCES occasions(id) ON DELETE CASCADE,
    PRIMARY KEY (package_id, occasion_id)
);
CREATE TABLE package_contexts (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    package_id uuid REFERENCES packages(id) ON DELETE CASCADE,
    context_id uuid REFERENCES service_contexts(id) ON DELETE CASCADE,
    PRIMARY KEY (package_id, context_id)
);
CREATE TABLE package_subjects (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    package_id uuid REFERENCES packages(id) ON DELETE CASCADE,
    subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE,
    PRIMARY KEY (package_id, subject_id)
);
CREATE TABLE package_purposes (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    package_id uuid REFERENCES packages(id) ON DELETE CASCADE,
    purpose_id uuid REFERENCES purposes(id) ON DELETE CASCADE,
    PRIMARY KEY (package_id, purpose_id)
);
CREATE TABLE package_client_types (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    package_id uuid REFERENCES packages(id) ON DELETE CASCADE,
    client_type_id uuid REFERENCES client_types(id) ON DELETE CASCADE,
    PRIMARY KEY (package_id, client_type_id)
);

ALTER TABLE package_occasions ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_client_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View package occasions" ON package_occasions FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "View package contexts" ON package_contexts FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "View package subjects" ON package_subjects FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "View package purposes" ON package_purposes FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "View package client types" ON package_client_types FOR SELECT USING (organization_id IN (SELECT auth_org_ids()));
