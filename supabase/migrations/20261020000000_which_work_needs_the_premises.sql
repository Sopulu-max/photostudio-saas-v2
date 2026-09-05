-- Which work needs the studio's own premises.
--
-- A studio's opening hours are a fact about a BUILDING. They constrain work
-- that happens in it and say nothing at all about a wedding at somebody's
-- venue — and the public booking path was enforcing them on everything.
--
-- Glamour opens at 13:00 on Sundays, so resolveScheduledFor refused a Sunday
-- morning wedding through the public link because the office was shut. For a
-- photography business that is most of the weddings.
--
-- THE STUDIO ALREADY SAYS THIS, IN ITS OWN WORDS. Glamour classifies work by
-- Context — Studio or Outdoor — and Portrait Photography carries both, so this
-- cannot be a fact about a service: it is a fact about what a booking was
-- NARROWED to. The narrowing already exists; what is missing is knowing what a
-- value MEANS for the premises.
--
-- WHICH THE ENGINE MUST NOT INFER. Nothing here may learn that a dimension
-- called "Context" is about location, or that a value called "Studio" means the
-- building — another studio will call them something else entirely, and a
-- system that guesses at meaning from names is exactly what promoted a
-- classification value to a service and filed it under the wrong domain.
--
-- So the studio declares it, on its own vocabulary, and everything else is
-- derived from the narrowing that is already there.
--
-- UNMARKED MEANS UNKNOWN, AND UNKNOWN NEVER REFUSES. The same rule the
-- classification kernel already keeps: silence is permission. A studio that has
-- said nothing about which work needs its building gets advice rather than a
-- closed door, because refusing a client on a guess is worse than letting a
-- booking through that somebody then moves.

alter table dimension_values
  add column if not exists at_premises boolean not null default false;

comment on column dimension_values.at_premises is
  'Work classified by this value happens at the studio''s own premises, so the studio''s opening hours apply to it. Declared by the studio: nothing infers this from the value''s name.';

-- Every check asks "do any of these values need the building?", so it is asked
-- of a handful of ids at a time and only the true ones matter.
create index if not exists dimension_values_at_premises
  on dimension_values (organization_id, id)
  where at_premises;

notify pgrst, 'reload schema';
