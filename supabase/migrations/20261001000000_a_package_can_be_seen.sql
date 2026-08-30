-- A package can be seen, not only read.
--
-- Two packages of one service carry the same name, the same classifications and
-- the same everything, and differ by a number. In a catalogue of cards that is
-- almost nothing to tell them apart by — and for a photography studio, of all
-- businesses, the obvious thing to tell them apart by is a picture of the work.
--
-- It lives on the package rather than in metadata because it is not a note
-- about the package; it is part of the offer. The storefront shows it to a
-- client deciding what to buy, and the catalogue shows it to an operator
-- deciding which one they are looking at.
--
-- Nullable, because a package is taken with whatever the studio has said so far
-- and a cover is something added when there is work to show. Nothing about a
-- package requires one.
alter table packages add column if not exists cover_url text;

comment on column packages.cover_url is
  'Public URL of the package cover image. Null until the studio has work to show.';
