-- A JOB WAS ALWAYS A BOOKING.
--
-- The floor called this table `jobs` and every screen has called the same row
-- a booking ever since. Two words for one thing, and the studio found out the
-- hard way: it opened a booking and the page started telling it about a job.
--
-- This project's own rule says which word wins:
--
--   Use the industry's words: client, booking, package, deliverable, invoice,
--   status. They are what a photographer already says.
--
-- "Job" is not on that list, and was never a word the studio used. It was a
-- developer's word that reached the schema first and then leaked outward
-- through a route, a button and three empty states.
--
-- DONE NOW BECAUSE IT IS FREE. Every one of these tables is empty. There is
-- no data to migrate, nothing to backfill, and no deployed client holding the
-- old names. The same rename after a studio is live would mean a careful
-- expand-and-contract across five tables; today it is one statement each.
--
-- The dependent columns are renamed with it. A `booking_id` that points at
-- `bookings` is the whole point: leaving them as `job_id` would keep the
-- second vocabulary alive in exactly the places a new feature reads first.
alter table weave.jobs rename to bookings;

alter table weave.occasions rename column job_id to booking_id;
alter table weave.files     rename column job_id to booking_id;
alter table weave.galleries rename column job_id to booking_id;
alter table weave.orders    rename column job_id to booking_id;

-- The indexes carried the old word in their names. Nothing reads an index
-- name, but the next person to look at this schema does.
alter index if exists weave.jobs_studio rename to bookings_studio;
alter index if exists weave.jobs_board rename to bookings_board;
alter index if exists weave.jobs_stage rename to bookings_stage;
alter index if exists weave.jobs_request_token_unique rename to bookings_request_token_unique;
alter index if exists weave.occasions_job rename to occasions_booking;
alter index if exists weave.files_job rename to files_booking;
alter index if exists weave.galleries_job rename to galleries_booking;
alter index if exists weave.orders_job rename to orders_booking;

-- The log recorded what each change MEANT, and it meant a booking even when
-- the column said job. `subject_type` is deliberately not a foreign key, so
-- nothing enforces this — it is just a string that has to be corrected, or
-- the history of every booking becomes unreadable the moment the reader
-- searches for the word the rest of the system now uses.
update weave.events set subject_type = 'booking' where subject_type = 'job';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
