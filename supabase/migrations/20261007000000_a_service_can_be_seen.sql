-- A service can be seen.
--
-- The same two columns a package already carries, for the same reason: the
-- services catalogue is a grid of cards a studio reads constantly, and
-- recognising a photograph is faster than reading a title. Packages got this
-- first because a package is what a client sees; a service is what the STUDIO
-- sees, every day, and the argument for recognition is no weaker there.
--
-- Both nullable, both additive. A service with no cover is a service, which is
-- progressive enrichment doing exactly what it is for: the column exists from
-- today, and no existing row has to answer for it.
--
-- No relationship changes. Nothing references these, and nothing about the
-- ontology graph in 02-ONTOLOGY.md moves — a cover is an attribute of an
-- entity, not an edge to another one.

alter table services add column if not exists cover_url text;
comment on column services.cover_url is
  'Public URL of the service cover image. Null until the studio has work to show.';

alter table services add column if not exists cover_position text;
comment on column services.cover_position is
  'CSS background-position for the cover, e.g. "50% 30%". Null means centred.';
