-- Crew belongs to the booking, not to a line inside it.
--
-- assignments was shaped for a model where a person was put on a booking LINE:
-- booking_line_id NOT NULL, booking_id nullable and mostly unused. That model
-- never ran — the two commands that wrote it had no surface, and the table is
-- empty — but its shape still forbade the thing that replaced it, so putting a
-- photographer on a booking failed with a null-violation on a column the new
-- model has no business filling.
--
-- Who is on a job is a fact about the JOB. A photographer is on Saturday's
-- shoot; they are not on "line 2 of Saturday's shoot". Where the work is
-- itemised finely enough to matter, that is what booking_line_tasks already
-- says, and each task carries its own assignee.
--
-- So: booking_id becomes required and booking_line_id becomes optional. The
-- line reference is kept rather than dropped because it is the honest way to
-- record someone brought in for one package on a multi-package booking, and
-- nothing is deleted here that could not be re-derived.
--
-- Safe to run: assignments holds zero rows, verified before writing this.

-- Any row that somehow predates this gets its booking from its line, so the
-- NOT NULL below cannot fail on real data.
update assignments a
set booking_id = bl.booking_id
from booking_lines bl
where a.booking_line_id = bl.id
  and a.booking_id is null;

alter table assignments
  alter column booking_line_id drop not null;

alter table assignments
  alter column booking_id set not null;

-- One person, one role, one booking. Without this, clicking Add twice puts
-- somebody on the same job twice and the crew list shows them twice.
create unique index if not exists assignments_one_person_per_role_per_booking
  on assignments (booking_id, employee_id, coalesce(role_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where booking_line_id is null;

comment on column assignments.booking_id is
  'The job this person is on. Required: crew is a fact about a booking.';
comment on column assignments.booking_line_id is
  'Optional narrowing, for someone brought in for one package on a multi-package booking.';
