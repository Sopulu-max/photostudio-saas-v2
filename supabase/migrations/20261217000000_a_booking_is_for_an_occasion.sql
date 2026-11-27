-- What the booking is for, in the studio's own words.
--
-- `weave.occasions` was removed because a thing that happens is a property of
-- the work and not an entity standing beside it. This is the part of that
-- table which really was a property: its `what` column, free text, carrying
-- the studio's word for the day — "Wedding", "Naming ceremony", "Headshots".
--
-- FREE TEXT, AND NEVER A LIST. The migration that created occasions said why,
-- and it is the whole reason this is a `text` column and not a `kind`:
--
--   The system before last had `sessions`, with the kind of the session
--   hardcoded — studio, outdoor, event — and the occasion hardcoded too:
--   birthday, wedding. That is the flat list this project spent a year
--   dissolving, and none of it comes back.
--
-- A fixed list would also fail this project's own test for a `kind`: a kind is
-- earned only where the ENGINE performs a distinct act. Nothing in this system
-- behaves differently for a wedding than for a christening. Two bookings that
-- differ by the word a studio writes on them differ by a word.
--
-- APART FROM `wants`, WHICH IS NOW SHOWN AS "Notes". They are different facts:
-- the occasion is what the day IS, the notes are what was said about it —
-- "Wedding" against "three outfits, prints for the grandparents". One is how a
-- studio finds the booking again; the other is what it has to remember.
alter table weave.bookings add column if not exists occasion text;

comment on column weave.bookings.occasion is
  'What the booking is for, in the studio''s own words and shown exactly as '
  'typed. Never a fixed list of event types: nothing in the engine behaves '
  'differently for one than another.';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
