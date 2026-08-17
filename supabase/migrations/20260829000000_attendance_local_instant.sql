-- Turning a wall-clock time into an instant, correctly.
--
-- Editing attendance means an operator types "08:15" and means quarter past
-- eight in the studio, on a given date. Converting that to a real instant
-- requires knowing the zone's offset ON THAT DATE, which changes across a
-- daylight-saving boundary.
--
-- Doing it in JavaScript means reconstructing offsets from formatted strings,
-- which is approximate and wrong for one hour twice a year in any zone that
-- observes DST. Postgres already carries the full timezone database, so the
-- conversion happens here and is exact.

create or replace function attendance_local_instant(
    p_date date,
    p_time time,
    p_timezone text
) returns timestamptz
language sql
immutable
as $$
    select (p_date + p_time) at time zone p_timezone;
$$;

comment on function attendance_local_instant is
    'Wall-clock date + time in a named zone -> the instant it refers to. Used when an operator corrects a check-in time.';
