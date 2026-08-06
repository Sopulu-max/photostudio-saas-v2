-- The ontology rebuild: separating what a studio DOES (Service — owned by
-- Services, the operations layer) from how it's SOLD (Package — a new
-- module, the marketing layer). A Package no longer points at one Service —
-- it bundles as many as the offering actually needs, which is what makes a
-- multi-discipline sale (photography + videography + design, one price) a
-- real structural fact instead of something forced onto a single tag or
-- hand-authored per combination.
--
-- A service is an organized process performed by one party that transforms
-- something of value for another. Photography transforms a moment into
-- photographs. Printing transforms a digital image into a physical print —
-- a different transformation, which is why it's a different Service, never
-- a property of the first one.

-- 1. The old "services" table was always the sellable, priced, bookable
-- thing — never really the service, always the commercial offering built on
-- top of one or more. Naming it what it is. (Second time this project has
-- made this exact move — service_templates became services for the same
-- reason, weeks ago.)
alter table services rename to packages;
alter table packages drop column discipline_id;      -- redundant: reachable transitively via its bundled services' domains
alter table packages drop column default_blueprint_id; -- process now belongs to Service; a package's own bonus stages live in extra_stages below
alter table packages add column extra_stages jsonb;   -- a package's own additions on top of whatever its bundled services already contribute (e.g. "Drone Coverage")
alter table packages rename column subject_id to occasion_id;

-- 2. Service Domain — Photography, Videography, Printing. What
-- service_disciplines already was; renamed for what it actually names.
alter table service_disciplines rename to service_domains;

-- 3. Occasions — what service_subjects always meant once "what's being
-- photographed" moved into which Service gets picked, leaving only "what
-- occasion" behind.
alter table service_subjects rename to occasions;

-- 4. The real Service catalog — what the studio actually knows how to do,
-- independent of how any of it gets sold. Not ephemeral template content: a
-- persisted, studio-extendable thing, engine-seeded with starting points the
-- same way a studio's first categories or roles are.
create table services (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  service_domain_id     uuid references service_domains(id) on delete set null,
  name                  text not null,
  description           text,
  default_blueprint_id  uuid references blueprints(id) on delete set null,
  status                text not null default 'active' check (status in ('active','retired')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_services_org on services(organization_id);
alter table services enable row level security;
create policy "Tenant Isolation" on services for all using (organization_id in (select auth_org_ids()));
create trigger trg_services_updated before update on services for each row execute function update_updated_at();

-- 5. Deliverables — a named, reusable vocabulary of what a service can
-- produce. Not three schemas for three ideas: a "secondary" deliverable is
-- just another Service, bundled into a Package the normal way, and a
-- "container" deliverable is the Delivery module, already built. This table
-- is only the "what comes out" vocabulary — primary outputs.
create table deliverables (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_deliverables_org on deliverables(organization_id, position);
alter table deliverables enable row level security;
create policy "Tenant Isolation" on deliverables for all using (organization_id in (select auth_org_ids()));
create trigger trg_deliverables_updated before update on deliverables for each row execute function update_updated_at();

create table service_deliverables (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  service_id      uuid not null references services(id) on delete cascade,
  deliverable_id  uuid not null references deliverables(id) on delete cascade,
  unique (service_id, deliverable_id)
);
create index idx_service_deliverables_org on service_deliverables(organization_id);
alter table service_deliverables enable row level security;
create policy "Tenant Isolation" on service_deliverables for all using (organization_id in (select auth_org_ids()));

-- 6. The core structural fix: a Package bundles services, plural.
create table package_services (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  package_id      uuid not null references packages(id) on delete cascade,
  service_id      uuid not null references services(id) on delete cascade,
  position        integer not null default 0,
  unique (package_id, service_id)
);
create index idx_package_services_org on package_services(organization_id);
alter table package_services enable row level security;
create policy "Tenant Isolation" on package_services for all using (organization_id in (select auth_org_ids()));

create table package_deliverables (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  package_id      uuid not null references packages(id) on delete cascade,
  deliverable_id  uuid not null references deliverables(id) on delete cascade,
  unique (package_id, deliverable_id)
);
create index idx_package_deliverables_org on package_deliverables(organization_id);
alter table package_deliverables enable row level security;
create policy "Tenant Isolation" on package_deliverables for all using (organization_id in (select auth_org_ids()));

-- 7. Booking lines sell packages, not services — same rename as #1, carried
-- through to the one place outside this module that referenced the old
-- table. The FK survives the table rename automatically; only the column
-- name needed to catch up to what it's always meant.
alter table booking_lines rename column service_id to package_id;
