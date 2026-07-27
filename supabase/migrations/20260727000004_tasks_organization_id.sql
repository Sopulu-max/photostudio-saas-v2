-- Add the missing organization_id column to tasks.
--
-- createTask inserts organization_id and updateTaskStatus filters on it (per the
-- Multi-Tenant Mandate — every query scoped to the org), but the column was
-- never added to the table. So every task insert failed, the seeding loop's
-- try/catch swallowed it, and activated workflows spawned with zero tasks.
-- Add it, backfill from the parent workflow, enforce not-null, index it.
alter table tasks add column organization_id uuid references organizations(id);

update tasks t
set organization_id = w.organization_id
from workflows w
where w.id = t.workflow_id and t.organization_id is null;

alter table tasks alter column organization_id set not null;

create index if not exists idx_tasks_org on tasks(organization_id);
