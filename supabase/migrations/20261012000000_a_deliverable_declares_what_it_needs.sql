-- A deliverable declares what it needs settling.
--
-- "Edited photograph" needs nothing. "Framed print" has a size and a frame, and
-- every package promising one has to settle both — which is a fact about the
-- KIND, not about any package that sells it. Said once here, it reaches every
-- package automatically.
--
-- WHY THIS IS NOT A NEW MECHANISM, in the words the dimension migration used
-- when it made the same argument: a variable already exists, with a kind, a
-- unit, options, bounds and a default; a package already decides whether it
-- fixes one or leaves it to the client; a booking line already holds the
-- answer. Building a second system for a deliverable's fields would be the
-- duplication this codebase keeps paying for — and it was built, in a jsonb
-- column called spec_schema carrying a shape invented for it, with three field
-- types against the eight the real one checks, no unit, no bounds, no default,
-- and no share of the one parser. This replaces that.
--
--   service:     what varies about the WORK             — outfits, hours
--   dimension:   what follows from a CLASSIFICATION     — the date of the occasion
--   deliverable: what a KIND OF OUTPUT needs specifying — a size, a frame
--
-- Additive. Every existing row keeps exactly one owner and answers the widened
-- check unchanged, because a row that satisfies "exactly one of two" satisfies
-- "exactly one of three".

alter table variables
  add column if not exists deliverable_id uuid references deliverables(id) on delete cascade;

comment on column variables.deliverable_id is
  'The deliverable this is declared on, when a kind of output is what needs specifying. Exactly one of service_id, dimension_id or deliverable_id is set.';

alter table variables drop constraint if exists variables_one_owner;
alter table variables add constraint variables_one_owner
  check (num_nonnulls(service_id, dimension_id, deliverable_id) = 1);

create index if not exists variables_deliverable_id_idx
  on variables (deliverable_id) where deliverable_id is not null;

notify pgrst, 'reload schema';
