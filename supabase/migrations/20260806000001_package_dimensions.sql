-- Where do we categorize from? The studio decides.
--
-- Fashion Photography and Birthday Photography don't feel like the same
-- kind of category because they aren't — one answers "what's the subject,"
-- the other "what's the occasion." Collapsing every distinguishing question
-- into one "Category" field (or hardcoding exactly two axes, as this schema
-- did until now) forces every studio into the same shape of business,
-- whether or not it fits them.
--
-- Five real questions cover the ground: what's the subject, what's the
-- occasion (already existed as `occasions`), where (already existed as
-- `service_contexts`), what's the purpose, who's the client. That set is
-- closed — bounded configurability again, just one level up: the engine
-- owns which dimensions exist, a studio owns which of them it actually
-- uses and what it calls its own values within each.

create table subjects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_subjects_org on subjects(organization_id, position);
alter table subjects enable row level security;
create policy "Tenant Isolation" on subjects for all using (organization_id in (select auth_org_ids()));
create trigger trg_subjects_updated before update on subjects for each row execute function update_updated_at();

create table purposes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_purposes_org on purposes(organization_id, position);
alter table purposes enable row level security;
create policy "Tenant Isolation" on purposes for all using (organization_id in (select auth_org_ids()));
create trigger trg_purposes_updated before update on purposes for each row execute function update_updated_at();

create table client_types (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_client_types_org on client_types(organization_id, position);
alter table client_types enable row level security;
create policy "Tenant Isolation" on client_types for all using (organization_id in (select auth_org_ids()));
create trigger trg_client_types_updated before update on client_types for each row execute function update_updated_at();

alter table packages add column subject_id     uuid references subjects(id) on delete set null;
alter table packages add column purpose_id     uuid references purposes(id) on delete set null;
alter table packages add column client_type_id uuid references client_types(id) on delete set null;

-- Which of the five a studio actually organizes by. Occasion and Context
-- already existed and worked, so they start enabled; Subject/Purpose/Client
-- are opt-in — new capability shouldn't appear as new clutter.
alter table organizations add column enabled_package_dimensions text[] not null default array['occasion', 'context'];
