-- Smart Extras (Level 2)
--
-- An extra is a discrete, additive commercial unit sold alongside a package.
-- By tying them explicitly to a target_type (deliverable, service, or another package),
-- we maintain the commercial "Basket" model on the booking without destroying
-- the package's pristine definition, while still feeding the production pipeline.

CREATE TABLE IF NOT EXISTS package_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  
  name text NOT NULL,
  description text,
  price jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- The structural target
  target_type text NOT NULL DEFAULT 'custom'
    CHECK (target_type IN ('deliverable', 'service', 'package', 'custom')),
    
  target_deliverable_id uuid REFERENCES deliverables(id) ON DELETE SET NULL,
  target_deliverable_quantity integer,
  
  target_service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  
  target_package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  
  position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
    
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_package_extras_package ON package_extras(package_id, position);
CREATE INDEX IF NOT EXISTS idx_package_extras_org ON package_extras(organization_id);

ALTER TABLE package_extras ENABLE ROW LEVEL SECURITY;

DO $$$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'package_extras' AND policyname = 'Tenant Isolation'
    ) THEN
        CREATE POLICY "Tenant Isolation" ON package_extras FOR ALL USING (organization_id IN (SELECT auth_org_ids()));
    END IF;
END
$$$;

DROP TRIGGER IF EXISTS trg_package_extras_updated ON package_extras;
CREATE TRIGGER trg_package_extras_updated
  BEFORE UPDATE ON package_extras
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Record the provenance on the booking line.
-- A booking line can now be an instance of an extra, preserving the basket structure.
ALTER TABLE booking_lines
  ADD COLUMN IF NOT EXISTS package_extra_id uuid REFERENCES package_extras(id) ON DELETE SET NULL;

