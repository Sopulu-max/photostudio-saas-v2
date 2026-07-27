-- Add the missing foreign key from intents.service_template_id to
-- service_templates(id).
--
-- The column existed without a FK constraint, so PostgREST could not resolve the
-- `template:service_templates(...)` embed used on the Intents list and detail
-- pages. The embed errored, the pages swallowed the error, and every intent
-- rendered as "none found" / 404 — silently breaking the whole intent→contract
-- entry point. on delete set null: deleting a service must not delete inquiries.
alter table intents
  add constraint intents_service_template_id_fkey
  foreign key (service_template_id) references service_templates(id)
  on delete set null;
