-- 20260721000005_rls_auth.sql

-- 1. Link kernel 'persons' to Supabase Auth
ALTER TABLE persons 
ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create an index for fast lookups
CREATE INDEX IF NOT EXISTS idx_persons_auth_user_id ON persons(auth_user_id);

-- 2. Helper Function to get the user's organization(s)
-- A user might belong to an org if they are a person in that org
CREATE OR REPLACE FUNCTION auth_org_ids()
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM persons WHERE auth_user_id = auth.uid();
$$ LANGUAGE sql STABLE;

-- 3. Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_layouts ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies (Users can only see data for their orgs)

-- Organizations
CREATE POLICY "Users can view their own organizations" 
ON organizations FOR SELECT 
USING (id IN (SELECT auth_org_ids()));

-- Persons
CREATE POLICY "Users can view persons in their orgs" 
ON persons FOR ALL 
USING (organization_id IN (SELECT auth_org_ids()));

-- Resources
CREATE POLICY "Users can manage resources in their orgs" 
ON resources FOR ALL 
USING (organization_id IN (SELECT auth_org_ids()));

-- Intents
CREATE POLICY "Users can manage intents in their orgs" 
ON intents FOR ALL 
USING (organization_id IN (SELECT auth_org_ids()));

-- Agreements
CREATE POLICY "Users can manage agreements in their orgs" 
ON agreements FOR ALL 
USING (organization_id IN (SELECT auth_org_ids()));

-- Workflows
CREATE POLICY "Users can manage workflows in their orgs" 
ON workflows FOR ALL 
USING (organization_id IN (SELECT auth_org_ids()));

-- Tasks
CREATE POLICY "Users can manage tasks in their orgs" 
ON tasks FOR ALL 
USING (workflow_id IN (SELECT id FROM workflows WHERE organization_id IN (SELECT auth_org_ids())));

-- Assets
CREATE POLICY "Users can manage assets in their orgs" 
ON assets FOR ALL 
USING (organization_id IN (SELECT auth_org_ids()));

-- Deliverables
CREATE POLICY "Users can manage deliverables in their orgs" 
ON deliverables FOR ALL 
USING (asset_id IN (SELECT id FROM assets WHERE organization_id IN (SELECT auth_org_ids())));

-- Financial Transactions
CREATE POLICY "Users can manage financials in their orgs" 
ON financial_transactions FOR ALL 
USING (organization_id IN (SELECT auth_org_ids()));

-- Templates
CREATE POLICY "Users can manage service templates in their orgs" 
ON service_templates FOR ALL 
USING (organization_id IN (SELECT auth_org_ids()));

CREATE POLICY "Users can manage workflow templates in their orgs" 
ON workflow_templates FOR ALL 
USING (organization_id IN (SELECT auth_org_ids()));

CREATE POLICY "Users can manage visual layouts in their orgs" 
ON visual_layouts FOR ALL 
USING (organization_id IN (SELECT auth_org_ids()));

-- Allow service role bypass
-- Note: Service role automatically bypasses RLS in Postgres, so no explicit policy is needed for the admin client.
