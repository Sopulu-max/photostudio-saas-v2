-- Bookings module · point a booking's client at the kernel contact.
--
-- A booking references a client, and a client is a contact (the Clients module
-- will specialise on top). So the durable reference is contact_id → contacts.
-- Additive and non-destructive: person_id stays until the dependent modules
-- (Contracts, Finances) are rebuilt onto contacts.
alter table bookings add column contact_id uuid references contacts(id);

update bookings b
set contact_id = c.id
from contacts c
where (c.metadata->>'backfill_person_id') = b.person_id::text
  and b.person_id is not null;

create index idx_bookings_contact on bookings(contact_id);
