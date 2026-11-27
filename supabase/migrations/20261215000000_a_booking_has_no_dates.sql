-- Removing `weave.occasions` and `weave.crew`.
--
-- WHY. Occasions were built as a thing in their own right — a row with its own
-- date, its own people, its own outcome, and a NULLABLE `booking_id` so one
-- could exist belonging to nobody. The studio's objection was that a thing
-- that happens is a PROPERTY of the work, not an entity beside it, and that
-- the schema was claiming otherwise.
--
-- The alternative offered was to keep the table and make it honestly a
-- property: rename it to the trade's word and make `booking_id` NOT NULL. That
-- was declined in favour of removing it outright with no replacement. This is
-- that decision, carried out whole rather than half.
--
-- ---------------------------------------------------------------- the cost
-- Stated here because a migration is where it will be read later:
--
--   * `weave.crew` goes with it. It was `(occasion_id, person_id)` — the only
--     record of WHO WAS ON a shoot. Nothing records that now. The team page
--     no longer says what anybody is carrying, and letting somebody go no
--     longer warns that they are on next week's wedding.
--
--   * Double-booking detection goes. `overlaps()` needed two spans to compare,
--     and a span needed `starts_at`/`ends_at`. A studio can now commit one
--     person to two places and nothing will say so.
--
--   * The calendar goes. `/calendar` read occasions and nothing else, so the
--     route, its diary and its tests were deleted with them.
--
--   * The dashboard loses two of its six readings: "shoots today" and
--     "bookings without a shoot". Both were answers about dates and a booking
--     has none. Nothing was invented to fill the gap.
--
--   * The phone stops being about today. "On today" was the day's shoots.
--
--   * `files.occasion_id` goes. A file could be tagged to the day it was taken
--     on; that day no longer exists as anything.
--
-- A booking now records WHO it is for, WHAT they want, what PACKAGE it is, and
-- whose move it is. `asked_for` survives as the date a client asked for, which
-- was never a schedule — it is a fact about the request.

-- A file can no longer belong to a day.
drop index if exists weave.files_occasion;
alter table weave.files drop column if exists occasion_id;

-- Who was on a shoot. Dropped before occasions because it points at it.
drop table if exists weave.crew;

-- The things that happened.
drop table if exists weave.occasions;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
