-- A booking's task is what happened on a step, not a copy of the step.
--
-- 20261106 took the copy out of packages: a package holds only its
-- departures from its services' workflows and reads the rest at the moment
-- of reading. It left one copy standing - the booking froze the resolved
-- list into booking_tasks, on the reasoning that an instance freezes. An
-- instance freezes the PROMISE: deliverables, quantities, price - the
-- agreement with the client. Tasks are not in the agreement. A workflow is
-- how the studio works now, and a job in flight that has not passed a step
-- has no reason to follow last month's process. Rename a step, add one,
-- drop one: every live job should see it.
--
-- What is genuinely the booking's own is what HAPPENED on a step: who is on
-- it, when it was finished, a role the studio changed for this job. So a
-- booking_tasks row now exists only for that - or for a step the booking
-- added itself (workflow_task_id null, as before). The list is resolved at
-- read: the line's package (an instance, so its departures stay as booked)
-- -> the service's workflow as it is now -> these rows laid over it.
--
-- A step removed from the workflow: the trigger below keeps every row that
-- carries a fact, giving it the step's name and role so it stands on its own
-- as the booking's step (the FK sets workflow_task_id null), and drops the
-- rows and package departures that said nothing. A fact does not un-happen.
--
-- Contract step: the code stopped copying before this runs.

-- Name and role are the workflow's unless this booking changed them.
alter table booking_tasks alter column name drop not null;

update booking_tasks t
set name = null
from workflow_tasks wt
where t.workflow_task_id = wt.id and t.name = wt.name;

update booking_tasks t
set role_id = null
from workflow_tasks wt
where t.workflow_task_id = wt.id and t.role_id = wt.default_role_id;

-- A row with nothing of its own says nothing: the workflow says it already.
delete from booking_tasks
where workflow_task_id is not null
  and name is null
  and role_id is null
  and assignee_id is null
  and completed_at is null;

-- A step is the workflow's, or the package's own. A row about the package's
-- own step names it, so what happened on "Deliver the album" is found again.
alter table booking_tasks
  add column if not exists package_task_id uuid references package_tasks(id) on delete set null;

-- One row per step per bundle row on a line; first touch relies on it.
create unique index if not exists booking_tasks_one_per_step
  on booking_tasks (booking_line_id, package_service_id, workflow_task_id)
  where workflow_task_id is not null;
create unique index if not exists booking_tasks_one_per_own_step
  on booking_tasks (booking_line_id, package_service_id, package_task_id)
  where package_task_id is not null;

-- A step leaving the workflow leaves its facts behind, standing on their own.
create or replace function retire_workflow_task() returns trigger
language plpgsql as $$
begin
  update booking_tasks
  set name = coalesce(name, old.name),
      role_id = coalesce(role_id, old.default_role_id)
  where workflow_task_id = old.id
    and (assignee_id is not null or completed_at is not null or name is not null or role_id is not null);
  delete from booking_tasks
  where workflow_task_id = old.id
    and assignee_id is null and completed_at is null and name is null and role_id is null;
  delete from package_tasks where workflow_task_id = old.id;
  return old;
end $$;

drop trigger if exists workflow_task_retires on workflow_tasks;
create trigger workflow_task_retires
  before delete on workflow_tasks
  for each row execute function retire_workflow_task();

-- The same for a package's own step.
create or replace function retire_package_task() returns trigger
language plpgsql as $$
begin
  update booking_tasks
  set name = coalesce(name, old.name),
      role_id = coalesce(role_id, old.role_id)
  where package_task_id = old.id
    and (assignee_id is not null or completed_at is not null or name is not null or role_id is not null);
  delete from booking_tasks
  where package_task_id = old.id
    and assignee_id is null and completed_at is null and name is null and role_id is null;
  return old;
end $$;

drop trigger if exists package_task_retires on package_tasks;
create trigger package_task_retires
  before delete on package_tasks
  for each row execute function retire_package_task();

comment on table booking_tasks is
  'What happened on a step of a booking''s work (assignee, completion, a role changed for this job) or a step the booking added itself (workflow_task_id null). Never a copy of the workflow: the list is resolved at read from the line''s package and the service''s workflow as it is now, and these rows are laid over it.';
