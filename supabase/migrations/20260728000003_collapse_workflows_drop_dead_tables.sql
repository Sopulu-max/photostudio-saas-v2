-- The disentanglement: nothing in the schema predates the module map.
--
-- 1. Collapse workflows into booking_lines (the blueprint's call): the LINE is
--    the production unit. Tasks hang directly off a line; production state is
--    derived from its tasks, not stored in a pass-through container.
-- 2. Drop the dead deferred tables (assets, deliverables, resources): the
--    Delivery and Scheduling modules will create their own schema when they are
--    actually built — no dead tables waiting for a UI.
--
-- All business data was wiped by choice beforehand; these are empty.

-- Tasks belong to a line now. The old RLS policy scoped tasks through their
-- workflow; scope directly by organization_id instead (the column exists).
drop policy if exists "Users can manage tasks in their orgs" on tasks;
create policy "Tenant Isolation" on tasks for all using (organization_id in (select auth_org_ids()));

alter table tasks add column booking_line_id uuid references booking_lines(id) on delete cascade;
alter table tasks drop column if exists workflow_id;
alter table tasks alter column booking_line_id set not null;
create index idx_tasks_line on tasks(booking_line_id);

-- The pass-through container goes.
drop table if exists workflows cascade;

-- Dead deferred tables go (their modules arrive with their own schema).
drop table if exists deliverables cascade;
drop table if exists assets cascade;
drop table if exists resources cascade;
