-- Turning a question off is a domain's answer, and a name is unique to a studio.
--
-- Two things the last migration left behind. It moved a dimension from the
-- domain to the studio and gave a domain a join row to say which questions it
-- asks — but two things still behaved as though a dimension belonged to one
-- domain, and both were now studio-wide by accident rather than by decision.
--
-- ── 1. is_active reached across the studio ────────────────────────────────
--
-- WHAT WAS WRONG. `dimensions.is_active` is written by the Turn off button on
-- the Classifications settings screen, which is shown one domain at a time and
-- says, above the list, "Anything added here applies only to this domain."
-- Once a dimension is shared, that flag is not this domain's answer any more:
-- turning Occasion off from Videography turned it off for Photography too, and
-- the public intake stopped offering it under either. Every dimension in this
-- studio is asked by both domains, so every toggle on that screen had studio-
-- wide reach.
--
-- This is the same hazard the previous migration fixed for Remove — a
-- destructive action that used to touch one screen now silently reaches across
-- the studio — one button along, and missed.
--
-- WHY IT GOES ON THE JOIN. "Does this domain ask this question" is already what
-- the join row means; whether it asks it *at the moment* is the same fact with
-- a time on it. The alternative, deleting the flag and letting the join row's
-- existence carry it, collapses Turn off into Remove and loses a real
-- distinction: off keeps the question in the list, in its place, ready to come
-- back, which is what a studio pausing a question actually wants.
--
-- Backfilled from the current value, so nothing changes the moment this runs:
-- a question off studio-wide is off in each domain that asks it, and becomes
-- separately answerable from there.
--
-- ── 2. the unique index guarded a retired column ──────────────────────────
--
-- WHAT WAS WRONG. `dimensions_unique_name` was on (service_domain_id,
-- lower(name)) — the column the last migration retired. New dimensions are
-- inserted without it, so it is null, and Postgres treats nulls as DISTINCT in
-- a unique index. Every dimension created from here on would pass the index no
-- matter how many share a name. The duplication that migration spent 156 lines
-- merging away had nothing left stopping it from being recreated by hand.
--
-- It happened to still hold for the five survivors only because they each kept
-- a non-null value from before. That is an accident, not a guarantee.
--
-- The invariant is now what the last migration made true: one question per
-- name, per studio. Verified before writing this — 3 organizations, no
-- organization holding two dimensions of the same name — so the index builds.

-- ── a domain answers for itself ───────────────────────────────────────────
alter table service_domain_dimensions
  add column if not exists is_active boolean not null default true;

update service_domain_dimensions sdd
set is_active = d.is_active
from dimensions d
where d.id = sdd.dimension_id;

comment on column service_domain_dimensions.is_active is
  'Whether this domain currently classifies by this question. Per domain: Photography may ask Occasion while Videography has it turned off.';

-- Kept, unused, rather than dropped in the same breath as the code that stops
-- reading it — the same reason service_domain_id is still here. The deployed
-- app reads this column until the release carrying this migration is live.
comment on column dimensions.is_active is
  'RETIRED. Whether a question is asked is per domain now: service_domain_dimensions.is_active. Left in place until the next migration so no deployed reader trips over its absence.';

-- ── one question per name, per studio ─────────────────────────────────────
drop index if exists dimensions_unique_name;

create unique index if not exists dimensions_unique_name
  on dimensions (organization_id, lower(btrim(name)));

-- btrim as well as lower, because " Occasion" and "Occasion" are the same
-- question typed with a stray space, and the merge that produced these rows
-- already treated them as one.
