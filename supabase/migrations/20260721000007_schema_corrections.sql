-- 20260721000007_schema_corrections.sql
-- Corrects critical schema mismatches identified in architectural audit.

-- 1. Add form_schema column to service_templates
-- This column is used by createServiceTemplate() but was missing from the schema.
ALTER TABLE service_templates ADD COLUMN IF NOT EXISTS form_schema JSONB DEFAULT '[]';

-- 2. Enforce FK on workflows.template_id to point to workflow_templates, not service_templates.
-- First, null out any existing template_ids that don't exist in workflow_templates (caused by old bug)
UPDATE workflows 
SET template_id = NULL 
WHERE template_id IS NOT NULL 
  AND template_id NOT IN (SELECT id FROM workflow_templates);

-- Now it is safe to add the constraint
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_template_id_fkey;
ALTER TABLE workflows
  ADD CONSTRAINT workflows_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE SET NULL;
