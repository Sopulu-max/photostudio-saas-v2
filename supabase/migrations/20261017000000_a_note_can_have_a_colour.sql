-- A note can have a colour.
--
-- WHY A NOTE AND NOT ANYTHING ELSE. Colour here is not status and not
-- classification — the app already says both of those in its own vocabulary,
-- and a second colour language competing with `q-state-*` would be drift. This
-- is the one place where colour carries no meaning the system defines: the
-- operator's own, applied to their own working memory, so that a wall of notes
-- can be scanned by eye instead of read. A studio that colours nothing loses
-- nothing, which is why it is nullable and why null is the default.
--
-- THE NAMES ARE THE DESIGN SYSTEM'S, NOT A PALETTE OF THEIR OWN. Lumen has
-- seven hues, each already defined twice in globals.css — once light, once dark
-- — and each already used for badges via color-mix. Storing the HUE NAME rather
-- than a hex is what keeps that true: a note coloured amber is amber in both
-- themes and stays correct if the ramp is ever retuned, because the row holds a
-- reference to the system rather than a copy of one moment of it. A hex column
-- here would have been the one thing the design system forbids, written into
-- the database where no stylesheet could reach it.
--
-- The check names the seven rather than accepting any string, for the same
-- reason about_type does: a value nothing can render is a note that exists and
-- looks broken. Adding an eighth means adding it here, which is the reminder
-- that it also needs a token.

alter table notes
  add column if not exists colour text;

comment on column notes.colour is
  'One of Lumen''s seven hue names, or null for plain paper. A reference to the design system, never a hex.';

alter table notes drop constraint if exists notes_colour_is_a_hue;
alter table notes add constraint notes_colour_is_a_hue
  check (colour is null or colour in ('amber','green','blue','violet','teal','rose','red'));

notify pgrst, 'reload schema';
