-- Workflows belong to Service Domains
create table workflows (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references organizations(id) on delete cascade,
    service_domain_id uuid not null references service_domains(id) on delete cascade,
    name              text not null,
    description       text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique(organization_id, service_domain_id, name)
);

-- Workflow Tasks belong to Workflows
create table workflow_tasks (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    workflow_id     uuid not null references workflows(id) on delete cascade,
    name            text not null,
    default_role_id uuid references roles(id) on delete set null,
    position        integer not null default 0,
    description     text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Add workflow_id to services
alter table services 
add column workflow_id uuid references workflows(id) on delete set null;

-- Package Tasks (cloned from Workflow Tasks when a service is added to a package)
create table package_tasks (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid not null references organizations(id) on delete cascade,
    package_service_id uuid not null references package_services(id) on delete cascade,
    workflow_task_id   uuid references workflow_tasks(id) on delete set null,
    name               text not null,
    role_id            uuid references roles(id) on delete set null,
    position           integer not null default 0,
    is_active          boolean not null default true,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

-- Booking Line Tasks (instantiated when a booking is created)
create table booking_line_tasks (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    booking_line_id uuid not null references booking_lines(id) on delete cascade,
    workflow_task_id uuid references workflow_tasks(id) on delete set null,
    name            text not null,
    role_id         uuid references roles(id) on delete set null,
    assignee_id     uuid references contacts(id) on delete set null,
    status          text not null default 'pending', -- pending, doing, done
    position        integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Enable RLS
alter table workflows enable row level security;
alter table workflow_tasks enable row level security;
alter table package_tasks enable row level security;
alter table booking_line_tasks enable row level security;

-- Policies for workflows
create policy "workflows_isolation" on workflows
    for all using (organization_id in (select auth_org_ids()));

-- Policies for workflow_tasks
create policy "workflow_tasks_isolation" on workflow_tasks
    for all using (organization_id in (select auth_org_ids()));

-- Policies for package_tasks
create policy "package_tasks_isolation" on package_tasks
    for all using (organization_id in (select auth_org_ids()));

-- Policies for booking_line_tasks
create policy "booking_line_tasks_isolation" on booking_line_tasks
    for all using (organization_id in (select auth_org_ids()));

-- Realtime replication
alter publication supabase_realtime add table workflows;
alter publication supabase_realtime add table workflow_tasks;
alter publication supabase_realtime add table package_tasks;
alter publication supabase_realtime add table booking_line_tasks;
