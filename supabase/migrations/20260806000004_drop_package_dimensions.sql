-- A Package is a bundle of Services. It derives its dimensions directly from
-- the services it contains, rather than defining its own independent tags.
alter table packages drop column occasion_id;
alter table packages drop column context_id;
alter table packages drop column subject_id;
alter table packages drop column purpose_id;
alter table packages drop column client_type_id;
