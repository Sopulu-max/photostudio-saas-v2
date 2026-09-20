-- A package holds only its departures from the workflow.
--
-- For a while a package held a full copy of every step of its services'
-- workflows: cloned when the service was bundled (20260914), patched forward
-- by a sync when the workflow was saved, and copied again onto every
-- booking's instance - four copies of "Shoot, by a Photographer, first"
-- before anyone could be assigned to it. Fifty-four rows here, not one of
-- them different from the step it copied. A step renamed on the workflow
-- reached none of them; a service given a workflow after it was bundled got
-- nothing until someone re-saved the workflow.
--
-- The rule members settled applies here exactly: declare nothing, hold only
-- what differs, resolve at read, freeze at booking. A package_tasks row is
-- now one of two things: a DEPARTURE from a workflow step (workflow_task_id
-- set: switched off, or given another role - the name is the workflow's, so
-- it is null here), or a step of the package's OWN (workflow_task_id null: a
-- name, a role, a position after the workflow's). The package reads its
-- services' workflows at the moment of reading. A booking still freezes the
-- resolved list into booking_tasks; that is what an instance is for.
--
-- Contract step: the code stopped writing copies before this runs. The rows
-- deleted below are exactly the ones that say nothing - active, same name,
-- same role as their step - across catalogue packages and instances alike
-- (an instance's copy was read once at booking and never again).

delete from package_tasks pt
using workflow_tasks wt
where pt.workflow_task_id = wt.id
  and pt.is_active
  and pt.name = wt.name
  and pt.role_id is not distinct from wt.default_role_id;

-- A departure carries no name of its own.
alter table package_tasks alter column name drop not null;
update package_tasks set name = null where workflow_task_id is not null;

-- One departure per step per bundle row; upsert relies on it.
create unique index if not exists package_tasks_one_departure
  on package_tasks (package_service_id, workflow_task_id)
  where workflow_task_id is not null;

comment on table package_tasks is
  'A package''s departures from its services'' workflows (workflow_task_id set: switched off or re-roled; name null) and its own steps (workflow_task_id null). Never a copy of the workflow: that is read at the moment of reading and frozen into booking_tasks at booking.';
