-- Add DNA mapping tables to service_domains (Upgrading Domains to True Service Parents)

CREATE TABLE service_domain_deliverables (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_domain_id uuid REFERENCES service_domains(id) ON DELETE CASCADE,
    deliverable_id uuid REFERENCES deliverables(id) ON DELETE CASCADE,
    PRIMARY KEY (service_domain_id, deliverable_id)
);

CREATE TABLE service_domain_occasions (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_domain_id uuid REFERENCES service_domains(id) ON DELETE CASCADE,
    occasion_id uuid REFERENCES occasions(id) ON DELETE CASCADE,
    PRIMARY KEY (service_domain_id, occasion_id)
);

CREATE TABLE service_domain_contexts (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_domain_id uuid REFERENCES service_domains(id) ON DELETE CASCADE,
    context_id uuid REFERENCES service_contexts(id) ON DELETE CASCADE,
    PRIMARY KEY (service_domain_id, context_id)
);

CREATE TABLE service_domain_subjects (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_domain_id uuid REFERENCES service_domains(id) ON DELETE CASCADE,
    subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE,
    PRIMARY KEY (service_domain_id, subject_id)
);

CREATE TABLE service_domain_purposes (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_domain_id uuid REFERENCES service_domains(id) ON DELETE CASCADE,
    purpose_id uuid REFERENCES purposes(id) ON DELETE CASCADE,
    PRIMARY KEY (service_domain_id, purpose_id)
);

CREATE TABLE service_domain_client_types (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_domain_id uuid REFERENCES service_domains(id) ON DELETE CASCADE,
    client_type_id uuid REFERENCES client_types(id) ON DELETE CASCADE,
    PRIMARY KEY (service_domain_id, client_type_id)
);

-- Enable RLS
ALTER TABLE service_domain_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_domain_occasions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_domain_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_domain_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_domain_purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_domain_client_types ENABLE ROW LEVEL SECURITY;

-- Policies for Select, Insert, Update, Delete based on organization_id
CREATE POLICY "Tenant Isolation" ON service_domain_deliverables FOR ALL USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "Tenant Isolation" ON service_domain_occasions FOR ALL USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "Tenant Isolation" ON service_domain_contexts FOR ALL USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "Tenant Isolation" ON service_domain_subjects FOR ALL USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "Tenant Isolation" ON service_domain_purposes FOR ALL USING (organization_id IN (SELECT auth_org_ids()));
CREATE POLICY "Tenant Isolation" ON service_domain_client_types FOR ALL USING (organization_id IN (SELECT auth_org_ids()));

-- Add PostgREST notification to reload schema
NOTIFY pgrst, 'reload schema';
