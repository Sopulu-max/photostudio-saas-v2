-- Clearing the sediment out of a booking.
--
-- The floor was laid on 18 November with four tables, and its own comments say
-- why each column is there: "the previous system learned this and it was
-- right", "it earned its place; it starts in the floor". That is not a
-- derivation. Several columns came across because they had proved useful in a
-- system that no longer exists, and nothing has made them justify themselves
-- since. This makes them.
--
--   title        never selected, never written. Dead from the first day.
--   stage_id     zero references in the application. So is weave.stages.
--   expected_on  the column the occasions migration itself diagnosed.
--
-- ---------------------------------------------------------------- the date
-- `expected_on` is the interesting one, because it was carrying TWO facts and
-- a straight drop would have destroyed a real one.
--
--   1. The date a client ASKED FOR. Typed into the public request form by
--      somebody the studio has never met, before anything is scheduled.
--      Read on the requests list and on the asker's own page. Nothing else
--      in the system holds it.
--
--   2. The date the work HAPPENS. Which is what `weave.occasions` is for.
--
-- The migration that created occasions opened by diagnosing exactly this:
--
--   The previous system had one `scheduled_for` column on the booking and
--   therefore could not say any of that.
--
-- And then the floor kept that column. Occasions were built NEXT TO it rather
-- than instead of it, so both stood, and the diary wrote the same date into
-- both with nothing keeping them in step. Worse, crew hangs off an occasion —
-- "Chidi is on Saturday" — so a date held on the booking is a date nobody can
-- ever be put on. A booking made from the board got exactly that: a date, and
-- no structural way to staff it.
--
-- So the column is SPLIT rather than dropped. Renamed to `asked_for`, which is
-- the fact it honestly holds, and it is never again read as the schedule. A
-- booking keeps no schedule of its own; its dates are its occasions' dates.
-- The name matters: a column called `expected_on` sitting beside occasions
-- invites being used as the schedule, which is how the drift happened.

-- ------------------------------------------------------------------- dead
alter table weave.bookings drop column if exists title;

-- -------------------------------------------------------------- the split
alter table weave.bookings rename column expected_on to asked_for;

comment on column weave.bookings.asked_for is
  'The date the client asked for, as asked. NOT the schedule — that is '
  'weave.occasions. Set when work arrives from outside and not changed '
  'afterwards: what a client wanted and what was agreed are two facts, and a '
  'studio has reason to know both.';

-- The board index was on (studio_id, turn, expected_on) and followed the
-- rename. The board no longer orders by that column, so the index is rebuilt
-- on what it actually serves.
drop index if exists weave.bookings_board;
create index bookings_board on weave.bookings (studio_id, turn);

-- ---------------------------------------------------------- the schedule
-- FIXES ARE UNIVERSAL. Every booking that was accepted and carries a date but
-- has nothing in the diary would, from this migration onward, read as having
-- no date at all — the reading moved to occasions and there is no occasion to
-- read. So the date becomes the occasion it always should have been, in every
-- studio, before the code that stops reading it is deployed.
insert into weave.occasions (studio_id, booking_id, on_date)
select b.studio_id, b.id, b.asked_for
from weave.bookings b
where b.asked_for is not null
  and b.accepted_at is not null
  and not exists (select 1 from weave.occasions o where o.booking_id = b.id);

-- ---------------------------------------------------------- the pipeline
-- A table the studio was to own its vocabulary in, built on 12 December and
-- wired to nothing: zero references in the application, and no screen ever
-- reached it. `turn` remains the only stored position of a booking, which is
-- the point — two stored positions with nothing keeping them in step is the
-- same mistake as two dates.
--
-- Not a rejection of the idea. A studio naming its own stages is still the
-- right thing; it will be built when something reads it, against the shape
-- the reading needs, rather than left standing as a table nobody opens.
drop index if exists weave.bookings_stage;
alter table weave.bookings drop column if exists stage_id;
drop table if exists weave.stages;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
