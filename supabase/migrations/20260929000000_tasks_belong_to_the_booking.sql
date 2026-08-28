-- Tasks belong to the booking, not to a line inside it.
--
-- booking_line_tasks could only reach a booking THROUGH a line: booking_line_id
-- NOT NULL, no booking_id at all. So there was no such thing as a task on a
-- booking — only a task on one package within one. A booking with three
-- packages had three disconnected task lists and no way to see the work as one
-- job, which is how a studio actually sees it: the shoot is on Saturday, the
-- editing happens after, and it does not matter which package each step was
-- sold under.
--
-- It also made ad-hoc work impossible. "Drive to the venue" belongs to the
-- booking and to no package, and there was nowhere to put it.
--
-- So the booking becomes the owner and the line becomes optional context — the
-- same correction already made to assignments. A task keeps its line where it
-- came from one, because that is how the package it was sold under is still
-- known; it simply no longer REQUIRES one.
--
-- The table is renamed to match what it now holds. A name that says "line" for
-- a thing owned by a booking is the drift this codebase keeps paying for.
--
-- Safe to run: booking_line_tasks holds zero rows, verified before writing this.

alter table booking_line_tasks
  add column if not exists booking_id uuid references bookings(id) on delete cascade;

-- Any row predating this gets its booking from its line, so the NOT NULL below
-- cannot fail on real data.
update booking_line_tasks t
set booking_id = bl.booking_id
from booking_lines bl
where t.booking_line_id = bl.id
  and t.booking_id is null;

alter table booking_line_tasks
  alter column booking_id set not null;

alter table booking_line_tasks
  alter column booking_line_id drop not null;

alter table booking_line_tasks rename to booking_tasks;

create index if not exists booking_tasks_by_booking on booking_tasks (booking_id, position);

comment on table booking_tasks is
  'The work a booking involves. Collated from the packages on it, plus anything the studio adds itself.';
comment on column booking_tasks.booking_id is
  'The job this work is part of. Required: a task belongs to a booking.';
comment on column booking_tasks.booking_line_id is
  'Which package on the booking it came from, when it came from one. Null for work the studio added directly.';
