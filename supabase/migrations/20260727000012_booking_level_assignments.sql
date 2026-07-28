-- Assignments can attach to a booking, not only a task.
--
-- The genuine edge is employee ↔ work, but a studio knows "Sarah is shooting
-- this" before any task exists (progressive definition). So an assignment now
-- points at a booking, a task, or both — and a booking's crew is the union of
-- its own assignments and those rolled up from its tasks.
alter table assignments alter column task_id drop not null;
alter table assignments add column booking_id uuid references bookings(id) on delete cascade;

-- One of the two must be present — an assignment has to be to something.
alter table assignments add constraint assignments_target_present
  check (task_id is not null or booking_id is not null);

create index idx_assignments_booking on assignments(booking_id);

-- The old uniqueness assumed a task; make both shapes unique without clashing.
-- (Dropping the constraint drops its backing index.)
alter table assignments drop constraint if exists assignments_task_id_employee_id_role_id_key;
create unique index assignments_task_unique
  on assignments(task_id, employee_id, coalesce(role_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where task_id is not null;
create unique index assignments_booking_unique
  on assignments(booking_id, employee_id, coalesce(role_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where task_id is null and booking_id is not null;
