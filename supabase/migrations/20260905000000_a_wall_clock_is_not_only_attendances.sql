-- A wall clock is not attendance's alone.
--
-- attendance_local_instant turns "this date, at this time, in this zone" into
-- an instant, and it was named for its first caller rather than for what it
-- does. Bookings needs exactly the same thing and for exactly the same reason:
-- a client picking 10:00 on a booking form means ten in the morning AT THE
-- STUDIO, and the only place that can be resolved correctly is here, where the
-- timezone database knows the offset that applied on that date.
--
-- Renamed rather than copied. Two functions doing this would be two chances to
-- fix a daylight-saving bug in one of them.

alter function attendance_local_instant(date, time, text)
    rename to studio_local_instant;

comment on function studio_local_instant(date, time, text) is
    'A wall-clock time on a given date in a given IANA zone, as an instant. The offset is a per-date question, which is why this lives in Postgres and not in JavaScript.';
