-- Cleanup: Remove required input assets from services and workflows
-- as we transition to dynamic Intake Forms driven by Domain Knowledge.

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_required_input_deliverable_id_fkey;
ALTER TABLE services DROP COLUMN IF EXISTS required_input_deliverable_id;

-- Also clean up the blueprints table which inherited the same concept
ALTER TABLE blueprints DROP CONSTRAINT IF EXISTS blueprints_required_input_type_id_fkey;
ALTER TABLE blueprints DROP COLUMN IF EXISTS required_input_type_id;
