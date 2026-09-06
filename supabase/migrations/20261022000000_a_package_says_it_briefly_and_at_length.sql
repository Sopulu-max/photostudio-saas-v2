-- A package says it briefly, and at length.
--
-- There was one description, and it had to be both. On a card it was clamped to
-- two lines and trailed off mid-sentence; on the package's own page it was the
-- only thing there. So a studio writing for the card wrote something too thin
-- to sell with, and a studio writing for the page wrote something that arrived
-- on the card as an ellipsis.
--
-- Two fields, because they are two jobs. The short one is a line a client reads
-- while comparing three packages at a glance. The long one is what they read
-- once they have opened the one they like.
--
-- THE EXISTING COLUMN STAYS THE LONG ONE, so nothing needs rewriting: every
-- description already written is a paragraph, and a paragraph is what the page
-- wants. The new column is the one that did not exist.
--
-- AND IT IS OPTIONAL. A package with no short description falls back to its
-- long one, trimmed — which is exactly what happens today, so a studio that
-- never fills this in loses nothing. Silence is permission, as everywhere else
-- in this system.

alter table packages
  add column if not exists short_description text;

comment on column packages.short_description is
  'One line for a card, where the full description would be clipped. Falls back to a trimmed description when empty.';

notify pgrst, 'reload schema';
