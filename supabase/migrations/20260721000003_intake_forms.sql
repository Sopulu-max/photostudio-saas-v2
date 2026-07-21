-- ============================================================
-- MIGRATION: Intake Forms
-- Adds form_schema to service_templates for dynamic booking forms.
-- ============================================================

alter table service_templates
  add column if not exists form_schema jsonb not null default '[]'::jsonb;
