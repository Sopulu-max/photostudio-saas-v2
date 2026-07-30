-- How long things take.
--
-- Traced from the calendar: it shows a booking's start time and CANNOT show an
-- end, because nothing in the system knows how long a job runs.
--
-- Two places, following the definition/instance split we use everywhere:
--   · services.duration_minutes — how long this kind of work usually takes
--     (the definition; a suggestion)
--   · bookings.duration_minutes — how long THIS job actually runs (the
--     instance; the truth the calendar draws)
--
-- Both nullable, because plenty of work isn't time-boxed — an album design has
-- no sitting. A booking with no duration is a point on the calendar, exactly as
-- it is today.
--
-- Why not put duration on the line? Because a booking occupies ONE slot in the
-- diary. Two lines on the same day (photos + a consultation) don't each get
-- their own calendar entry, and summing them would be wrong for work that
-- happens in parallel. The lines suggest a default; the booking owns the answer.

alter table services add column duration_minutes integer;
alter table bookings add column duration_minutes integer;
