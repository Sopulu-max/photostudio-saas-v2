-- Contracts · Finances · Production — move the remaining modules onto the
-- kernel contact, and give Production real assignments.
--
-- Every module that referenced a "person" now references a contact (the kernel
-- party). person_id columns stay for one more step (nullable) so nothing breaks
-- mid-migration; they retire with the persons table once no code reads them.

-- ── Contracts ────────────────────────────────────────────────────────────────
alter table contracts add column contact_id uuid references contacts(id);
update contracts t set contact_id = c.id
  from contacts c where (c.metadata->>'backfill_person_id') = t.person_id::text;
alter table contracts alter column person_id drop not null;
create index idx_contracts_contact on contracts(contact_id);

-- ── Finances ─────────────────────────────────────────────────────────────────
alter table financial_transactions add column contact_id uuid references contacts(id);
update financial_transactions t set contact_id = c.id
  from contacts c where (c.metadata->>'backfill_person_id') = t.person_id::text;
create index idx_ft_contact on financial_transactions(contact_id);

-- ── Delivery (deferred module, but keep its refs coherent) ───────────────────
alter table deliverables add column contact_id uuid references contacts(id);
update deliverables d set contact_id = c.id
  from contacts c where (c.metadata->>'backfill_person_id') = d.person_id::text;

-- ── Production · real assignments (task ↔ employee ↔ role) ───────────────────
-- Replaces the single assigned_person_id: a shoot can need a Lead AND a Second,
-- and each assignment records which role the person is filling.
create table assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  task_id         uuid not null references tasks(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  role_id         uuid references roles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (task_id, employee_id, role_id)
);
create index idx_assignments_org on assignments(organization_id);
create index idx_assignments_task on assignments(task_id);
alter table assignments enable row level security;
create policy "Tenant Isolation" on assignments for all using (organization_id in (select auth_org_ids()));

-- Carry any existing single assignment across.
insert into assignments (organization_id, task_id, employee_id)
select t.organization_id, t.id, e.id
from tasks t
join contacts c on (c.metadata->>'backfill_person_id') = t.assigned_person_id::text
join employees e on e.contact_id = c.id
where t.assigned_person_id is not null;

-- ── Kernel · events actor becomes a contact ──────────────────────────────────
alter table events drop constraint if exists events_actor_id_fkey;
update events e set actor_id = c.id
  from contacts c where (c.metadata->>'backfill_person_id') = e.actor_id::text;
-- Null out any actor that couldn't be mapped, so the new FK can be trusted.
update events e set actor_id = null
  where e.actor_id is not null and not exists (select 1 from contacts c where c.id = e.actor_id);
alter table events add constraint events_actor_id_fkey
  foreign key (actor_id) references contacts(id);
