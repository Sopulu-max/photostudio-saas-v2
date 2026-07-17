-- ============================================================
-- PRODUCTION ENGINE: KERNEL SCHEMA
-- The 10 Level 1 immutable primitives + Level 3 config tables
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENTITY 1: ORGANIZATION
-- The persistent production entity. The root of all data.
-- ============================================================
create table organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text unique,
  status      text not null default 'active'
                check (status in ('active', 'suspended', 'archived')),
  metadata    jsonb default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- ENTITY 2: PERSON
-- Any human actor. Level 2 extends via the "role" column.
-- ============================================================
create table persons (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id),
  role              text not null default 'client'
                      check (role in ('configurator', 'operator', 'client', 'vendor', 'freelancer')),
  display_name      text not null,
  email             text,
  phone             text,
  status            text not null default 'active'
                      check (status in ('active', 'archived')),
  metadata          jsonb default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_persons_org on persons(organization_id);
create index idx_persons_role on persons(organization_id, role);

-- ============================================================
-- ENTITY 3: RESOURCE
-- Any non-human asset required for production.
-- ============================================================
create table resources (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id),
  type              text not null,
  name              text not null,
  status            text not null default 'available'
                      check (status in ('available', 'reserved', 'in_use', 'maintenance', 'retired')),
  metadata          jsonb default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_resources_org on resources(organization_id);

-- ============================================================
-- ENTITY 4: INTENT
-- The desire for something to exist that does not yet exist.
-- ============================================================
create table intents (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references organizations(id),
  person_id           uuid not null references persons(id),
  source              text,
  description         text,
  service_template_id uuid,
  status              text not null default 'created'
                        check (status in ('created', 'reviewed', 'accepted', 'declined', 'withdrawn', 'expired')),
  metadata            jsonb default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_intents_org on intents(organization_id);
create index idx_intents_person on intents(person_id);
create index idx_intents_status on intents(organization_id, status);

-- ============================================================
-- ENTITY 5: AGREEMENT
-- Mutual commitment to deliver value under specific terms.
-- ============================================================
create table agreements (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id),
  intent_id         uuid not null references intents(id),
  person_id         uuid not null references persons(id),
  version           integer not null default 1,
  terms             jsonb not null default '{}',
  status            text not null default 'proposed'
                      check (status in ('proposed', 'active', 'modified', 'completed', 'cancelled')),
  signed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_agreements_org on agreements(organization_id);
create index idx_agreements_person on agreements(person_id);
create index idx_agreements_status on agreements(organization_id, status);

-- ============================================================
-- ENTITY 6: WORKFLOW
-- An ordered sequence of stages that transforms intent into value.
-- ============================================================
create table workflows (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id),
  agreement_id      uuid not null references agreements(id),
  template_id       uuid,
  status            text not null default 'created'
                      check (status in ('created', 'in_progress', 'completed', 'halted')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_workflows_org on workflows(organization_id);
create index idx_workflows_agreement on workflows(agreement_id);

-- ============================================================
-- ENTITY 7: TASK
-- A discrete unit of work within a workflow stage.
-- ============================================================
create table tasks (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references organizations(id),
  workflow_id         uuid not null references workflows(id),
  stage_name          text not null,
  stage_order         integer not null default 0,
  assigned_person_id  uuid references persons(id),
  status              text not null default 'created'
                        check (status in ('created', 'assigned', 'in_progress', 'blocked', 'completed')),
  due_date            timestamptz,
  metadata            jsonb default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_tasks_workflow on tasks(workflow_id);
create index idx_tasks_org on tasks(organization_id);
create index idx_tasks_assigned on tasks(assigned_person_id);

-- ============================================================
-- ENTITY 8: ASSET
-- Any artifact produced or consumed during production.
-- ============================================================
create table assets (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id),
  workflow_id       uuid references workflows(id),
  origin            text not null
                      check (origin in ('produced', 'provided')),
  type              text not null,
  file_reference    text,
  status            text not null default 'registered'
                      check (status in ('registered', 'available', 'in_use', 'retained', 'released')),
  metadata          jsonb default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_assets_org on assets(organization_id);
create index idx_assets_workflow on assets(workflow_id);

-- ============================================================
-- ENTITY 9: DELIVERABLE
-- An approved asset transferred to the recipient.
-- ============================================================
create table deliverables (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id),
  asset_id        uuid not null references assets(id),
  agreement_id    uuid not null references agreements(id),
  person_id       uuid not null references persons(id),
  status          text not null default 'produced'
                    check (status in ('produced', 'reviewed', 'delivered', 'archived')),
  delivered_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index idx_deliverables_agreement on deliverables(agreement_id);
create index idx_deliverables_org on deliverables(organization_id);
create index idx_deliverables_person on deliverables(person_id);

-- ============================================================
-- ENTITY 10: FINANCIAL TRANSACTION
-- Any movement of money — in or out.
-- ============================================================
create table financial_transactions (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id),
  agreement_id      uuid references agreements(id),
  person_id         uuid references persons(id),
  direction         text not null
                      check (direction in ('inbound', 'outbound')),
  type              text not null,
  amount            decimal(12, 2) not null,
  currency          text not null default 'USD',
  status            text not null default 'created'
                      check (status in ('created', 'pending', 'settled', 'voided')),
  due_date          timestamptz,
  settled_at        timestamptz,
  metadata          jsonb default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_ft_org on financial_transactions(organization_id);
create index idx_ft_agreement on financial_transactions(agreement_id);
create index idx_ft_status on financial_transactions(organization_id, status);

-- ============================================================
-- EVENT LOG
-- Every state mutation emits an event. The organizational memory.
-- ============================================================
create table events (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id),
  entity_type       text not null,
  entity_id         uuid not null,
  action            text not null,
  actor_id          uuid references persons(id),
  payload           jsonb default '{}',
  created_at        timestamptz not null default now()
);
create index idx_events_org on events(organization_id);
create index idx_events_entity on events(entity_type, entity_id);
create index idx_events_created on events(organization_id, created_at desc);

-- ============================================================
-- LEVEL 3: WORKFLOW TEMPLATES
-- Reusable sequence of stages that can be attached to services.
-- ============================================================
create table workflow_templates (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references organizations(id),
  name                text not null,
  stages              jsonb not null default '[]',
  status              text not null default 'active'
                        check (status in ('active', 'retired')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_wt_org on workflow_templates(organization_id);

-- ============================================================
-- LEVEL 3: SERVICE TEMPLATES
-- Studio-specific configuration of how services are structured.
-- ============================================================
create table service_templates (
  id                    uuid primary key default uuid_generate_v4(),
  organization_id       uuid not null references organizations(id),
  name                  text not null,
  default_workflow_template_id uuid references workflow_templates(id),
  pricing               jsonb not null default '{}',
  resource_requirements jsonb default '{}',
  role_requirements     jsonb default '{}',
  deliverable_spec      jsonb default '{}',
  status                text not null default 'active'
                          check (status in ('active', 'retired')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_st_org on service_templates(organization_id);

-- ============================================================
-- LEVEL 3: VISUAL LAYOUTS
-- Stored layout definitions from the Ubiquitous Visual Engine.
-- ============================================================
create table visual_layouts (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id),
  context           text not null,
  name              text,
  layout_data       jsonb not null default '{}',
  status            text not null default 'draft'
                      check (status in ('draft', 'published')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  published_at      timestamptz
);
create index idx_vl_org on visual_layouts(organization_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- Automatically update the updated_at column on row changes.
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_organizations_updated before update on organizations for each row execute function update_updated_at();
create trigger trg_persons_updated before update on persons for each row execute function update_updated_at();
create trigger trg_resources_updated before update on resources for each row execute function update_updated_at();
create trigger trg_intents_updated before update on intents for each row execute function update_updated_at();
create trigger trg_agreements_updated before update on agreements for each row execute function update_updated_at();
create trigger trg_workflows_updated before update on workflows for each row execute function update_updated_at();
create trigger trg_tasks_updated before update on tasks for each row execute function update_updated_at();
create trigger trg_assets_updated before update on assets for each row execute function update_updated_at();
create trigger trg_ft_updated before update on financial_transactions for each row execute function update_updated_at();
create trigger trg_wt_updated before update on workflow_templates for each row execute function update_updated_at();
create trigger trg_st_updated before update on service_templates for each row execute function update_updated_at();
create trigger trg_vl_updated before update on visual_layouts for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Scope all queries to the authenticated user's organization.
-- ============================================================

-- Enable RLS on all tables
alter table organizations enable row level security;
alter table persons enable row level security;
alter table resources enable row level security;
alter table intents enable row level security;
alter table agreements enable row level security;
alter table workflows enable row level security;
alter table tasks enable row level security;
alter table assets enable row level security;
alter table deliverables enable row level security;
alter table financial_transactions enable row level security;
alter table events enable row level security;
alter table workflow_templates enable row level security;
alter table service_templates enable row level security;
alter table visual_layouts enable row level security;

-- Helper function to get the current user's organization_id from the JWT user_metadata
create or replace function auth_org_id() returns uuid as $$
  select (nullif(current_setting('request.jwt.claims', true)::json->'user_metadata'->>'organization_id', ''))::uuid;
$$ language sql stable;

-- Define Policies for Tenant Isolation
create policy "Tenant Isolation" on organizations for all using (id = auth_org_id());
create policy "Tenant Isolation" on persons for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on resources for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on intents for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on agreements for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on workflows for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on tasks for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on assets for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on deliverables for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on financial_transactions for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on events for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on workflow_templates for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on service_templates for all using (organization_id = auth_org_id());
create policy "Tenant Isolation" on visual_layouts for all using (organization_id = auth_org_id());

