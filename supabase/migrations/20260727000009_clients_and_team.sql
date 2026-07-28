-- Clients & Team modules — the real people-split, on the shared contact base.
--
-- No more generic "person with a role". A client (CRM) and an employee (team)
-- are different capabilities; each specialises on top of a kernel contact.
-- Additive/non-destructive: persons stays until the dependent refs are rebuilt.

-- ── Clients module ───────────────────────────────────────────────────────────
create table clients (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  contact_id      uuid not null references contacts(id),
  status          text not null default 'active',   -- active / archived
  source          text,                             -- how they found the studio
  tags            jsonb not null default '[]',
  notes           text,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, contact_id)
);
create index idx_clients_org on clients(organization_id);
alter table clients enable row level security;
create policy "Tenant Isolation" on clients for all using (organization_id in (select auth_org_ids()));
create trigger trg_clients_updated before update on clients for each row execute function update_updated_at();

-- ── Team module ──────────────────────────────────────────────────────────────
create table employees (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  contact_id      uuid not null references contacts(id),
  status          text not null default 'active',   -- active / archived
  title           text,                             -- job title
  skills          jsonb not null default '[]',
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, contact_id)
);
create index idx_employees_org on employees(organization_id);
alter table employees enable row level security;
create policy "Tenant Isolation" on employees for all using (organization_id in (select auth_org_ids()));
create trigger trg_employees_updated before update on employees for each row execute function update_updated_at();

create table roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name            text not null,                    -- e.g. "Lead Photographer"
  description     text,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_roles_org on roles(organization_id);
alter table roles enable row level security;
create policy "Tenant Isolation" on roles for all using (organization_id in (select auth_org_ids()));
create trigger trg_roles_updated before update on roles for each row execute function update_updated_at();

create table employee_roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  employee_id     uuid not null references employees(id) on delete cascade,
  role_id         uuid not null references roles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (employee_id, role_id)
);
create index idx_employee_roles_org on employee_roles(organization_id);
alter table employee_roles enable row level security;
create policy "Tenant Isolation" on employee_roles for all using (organization_id in (select auth_org_ids()));

-- ── Backfill from persons (via their contact) ────────────────────────────────
insert into clients (organization_id, contact_id, status, created_at)
select p.organization_id, c.id, 'active', p.created_at
from persons p
join contacts c on (c.metadata->>'backfill_person_id') = p.id::text
where p.role = 'client';

insert into employees (organization_id, contact_id, status, title, created_at)
select p.organization_id, c.id, 'active', initcap(p.role), p.created_at
from persons p
join contacts c on (c.metadata->>'backfill_person_id') = p.id::text
where p.role in ('configurator', 'operator', 'freelancer');
