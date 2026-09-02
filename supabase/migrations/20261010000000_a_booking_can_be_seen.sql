-- A booking can be seen.
--
-- The same two columns a service already carries, for the same reason: a
-- booking is what the studio thinks about constantly — scanning the calendar,
-- opening a job — and recognising a photograph is faster than reading a title.
--
-- Both nullable, both additive. A booking with no cover is a booking, which is
-- progressive enrichment doing exactly what it is for: the column exists from
-- today, and no existing row has to answer for it.
--
-- No relationship changes. Nothing references these, and nothing about the
-- ontology graph in 02-ONTOLOGY.md moves — a cover is an attribute of an
-- entity, not an edge to another one.

alter table bookings add column if not exists cover_url text;
comment on column bookings.cover_url is
  'Public URL of the booking cover image. Null until the studio has set one.';

alter table bookings add column if not exists cover_position text;
comment on column bookings.cover_position is
  'CSS background-position for the cover, e.g. "50% 30%". Null means centred.';
