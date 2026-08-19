-- When the studio opens.
--
-- Attendance could say who was here and when, but not whether that was on
-- time — and "on time" is most of what a register is for. Late is not a fact
-- about a person; it is the distance between when they arrived and when this
-- studio expects to be working. So it belongs to the studio, beside its
-- timezone, and for the same reason: both are the frame a check-in is read in.
--
-- NULLABLE, AND NULL MEANS SOMETHING. A studio that has never said when it
-- opens has no opinion about lateness, and the board shows none. Nothing is
-- guessed on their behalf — an invented 09:00 would mark real people late
-- against a number nobody chose. Progressive enrichment: the register is
-- useful with this empty and sharper once it is set.
--
-- A `time`, NOT a timestamp. Opening is a wall-clock fact that repeats every
-- day — quarter past eight is quarter past eight in June and in December.
-- Turning it into an instant needs a date and the zone's offset ON that date,
-- which is exactly what attendance_local_instant already does for check-ins,
-- and it does it in Postgres because that is where the timezone database lives.
--
-- What this deliberately is NOT: a per-person schedule, a shift, or a grace
-- period. One studio, one opening time. A person who starts at noon by
-- arrangement is a different fact with a different shape, and folding it in
-- here would make this column mean two things at once.

alter table organizations add column if not exists opens_at time;

comment on column organizations.opens_at is
    'Wall-clock time the studio opens, in its own timezone. Arrivals after it are late. Null means the studio has not said, and nothing is marked late.';
