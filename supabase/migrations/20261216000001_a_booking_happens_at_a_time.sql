-- One time, not two.
--
-- `starts_at` and `ends_at` came across from `weave.occasions`, where the pair
-- had a job: `overlaps()` compared two SPANS to decide whether the same person
-- was committed to two places at once, and a span needs both ends. That
-- mechanism went with `weave.crew` — nothing records who is on what any more —
-- so the end time has nothing left to inform. A reading that informs nobody is
-- the one thing this project will not keep.
--
-- `at` is the hour the work happens. `scheduled_for` is the day. Together they
-- read as a studio says it: scheduled for the tenth, at three.
--
-- SAFE AS ONE MIGRATION rather than expand-deploy-contract, because
-- `starts_at` was added minutes ago and `weave.bookings` holds no rows at all.
-- The backfill is written regardless: a code fix that changes what is stored
-- must carry the rows already stored, and writing it when there are none costs
-- nothing while leaving it out costs everything the one time it matters.
alter table weave.bookings add column if not exists at time;

update weave.bookings set at = starts_at where starts_at is not null and at is null;

comment on column weave.bookings.at is
  'The hour the work happens. Needs a day: see bookings_time_needs_a_day.';

-- The old pair, and the rule that only made sense for a pair.
alter table weave.bookings drop constraint if exists bookings_ends_after_it_starts;
alter table weave.bookings drop column if exists starts_at;
alter table weave.bookings drop column if exists ends_at;

-- An hour with no day is a number, not a time. Restated against `at`.
alter table weave.bookings drop constraint if exists bookings_time_needs_a_day;
do $$ begin
  alter table weave.bookings add constraint bookings_time_needs_a_day
    check (scheduled_for is not null or at is null);
exception when duplicate_object then null; end $$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
