-- 20260721000008_service_template_fix.sql
-- Fixes legacy column mismatch in service_templates

ALTER TABLE service_templates ADD COLUMN IF NOT EXISTS default_workflow_template_id UUID REFERENCES workflow_templates(id);
ALTER TABLE service_templates DROP COLUMN IF EXISTS workflow_stages;
