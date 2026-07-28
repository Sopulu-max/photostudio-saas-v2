-- Retire the persons table.
--
-- Every module now references the kernel `contacts` party: Clients and Team
-- specialise it, Bookings/Contracts/Finances/Deliverables point at contact_id,
-- events attribute to a contact, and auth resolves through contacts.auth_user_id.
-- The legacy person_id columns and the dual-writes that fed them are gone, so
-- the table has no readers left. Drop it, and the backfill breadcrumbs with it.

alter table bookings               drop column if exists person_id;
alter table contracts              drop column if exists person_id;
alter table financial_transactions drop column if exists person_id;
alter table deliverables           drop column if exists person_id;
alter table intents                drop column if exists person_id;
alter table tasks                  drop column if exists assigned_person_id;

drop table if exists persons cascade;

-- The contact→person breadcrumb from the migration is now meaningless.
update contacts set metadata = metadata - 'backfill_person_id'
  where metadata ? 'backfill_person_id';
