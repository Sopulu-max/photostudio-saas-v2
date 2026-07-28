-- Services module — name the things what they are.
--
-- "service_templates" was never a template: it IS the service a studio sells
-- (≈ Odoo product.template). And "workflow_templates" are reusable stage sets —
-- blueprints — owned by the Services module, referenced by a service. Renames
-- carry FKs, indexes and RLS policies automatically; data is untouched.

alter table service_templates  rename to services;
alter table workflow_templates rename to blueprints;

-- Reference columns follow the new names.
alter table services      rename column default_workflow_template_id to default_blueprint_id;
alter table workflows     rename column template_id           to blueprint_id;
alter table booking_lines rename column service_template_id   to service_id;
alter table intents       rename column service_template_id   to service_id;
