-- When the work happens, as a property of the booking.
--
-- `weave.occasions` held this and was removed, because a thing that happens is
-- a property of the work rather than an entity standing beside it. Removing it
-- left bookings with no date at all; this puts the date back where the studio
-- said it belongs — on the row.
--
-- WHAT THIS GIVES UP, AND IT IS NOT NOTHING. A column holds one value, so a
-- booking now has exactly one dated thing. A wedding with an engagement shoot
-- in March and the day itself in August is two dates and cannot be recorded as
-- one booking any more; it is two bookings, or it is one date. That was the
-- trade accepted when the table went, and it is written here so that whoever
-- reads this later knows it was a decision and not an oversight.
--
-- TWO DATES, DELIBERATELY, AND THEY ARE DIFFERENT FACTS.
--
--   asked_for      what the client asked for, typed into the public form by
--                  somebody the studio had never met. Never changes.
--   scheduled_for  what the studio and the client agreed.
--
-- "They asked for the twelfth and we booked the nineteenth" is a thing a
-- studio has every reason to know, and one column cannot say it.
alter table weave.bookings
  add column if not exists scheduled_for date,
  add column if not exists starts_at     time,
  add column if not exists ends_at       time;

comment on column weave.bookings.scheduled_for is
  'The day the work happens, as agreed. Distinct from asked_for, which is the '
  'day the client asked for and is never changed.';

-- An hour with no day is a number, not a time.
do $$ begin
  alter table weave.bookings add constraint bookings_time_needs_a_day
    check (scheduled_for is not null or (starts_at is null and ends_at is null));
exception when duplicate_object then null; end $$;

-- Nothing ends before it starts. Enforced here rather than trusted to a form,
-- because a form is a convenience in front of an endpoint and never the gate.
do $$ begin
  alter table weave.bookings add constraint bookings_ends_after_it_starts
    check (ends_at is null or starts_at is null or ends_at > starts_at);
exception when duplicate_object then null; end $$;

-- The board reads by turn; the diary reads by day. Both are scoped by studio.
create index if not exists bookings_when
  on weave.bookings (studio_id, scheduled_for);

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
