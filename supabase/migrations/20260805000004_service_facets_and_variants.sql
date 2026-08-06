-- The service field registry, part 1: Discipline, Subject, and Context —
-- three more studio-arranged shelves, identical mechanism to
-- service_categories. All three are open, studio-editable vocabulary; none
-- of them carry a fixed meaning the system reasons about, same as category.
-- (Context was originally sketched as a small fixed enum — in-studio /
-- outdoor / on-location / home — but "outdoor" already swallows "on-location"
-- and "home" as just where outdoors happens to be, and a studio doing
-- something this framework didn't anticipate shouldn't be locked out of
-- naming its own contexts. Open table, not a closed list.)

create table service_disciplines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_service_disciplines_org on service_disciplines(organization_id, position);
alter table service_disciplines enable row level security;
create policy "Tenant Isolation" on service_disciplines for all using (organization_id in (select auth_org_ids()));
create trigger trg_service_disciplines_updated before update on service_disciplines for each row execute function update_updated_at();

create table service_subjects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_service_subjects_org on service_subjects(organization_id, position);
alter table service_subjects enable row level security;
create policy "Tenant Isolation" on service_subjects for all using (organization_id in (select auth_org_ids()));
create trigger trg_service_subjects_updated before update on service_subjects for each row execute function update_updated_at();

create table service_contexts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_service_contexts_org on service_contexts(organization_id, position);
alter table service_contexts enable row level security;
create policy "Tenant Isolation" on service_contexts for all using (organization_id in (select auth_org_ids()));
create trigger trg_service_contexts_updated before update on service_contexts for each row execute function update_updated_at();

-- Deleting a facet value must never delete the services using it — same
-- rule category already follows.
alter table services add column discipline_id uuid references service_disciplines(id) on delete set null;
alter table services add column subject_id    uuid references service_subjects(id)    on delete set null;
alter table services add column context_id    uuid references service_contexts(id)    on delete set null;

-- Part 2: one graduated pricing axis per service — the structural
-- replacement for Extras. jsonb rather than a child table, the same
-- treatment form_schema already gets for the same shape of problem (a
-- small, ordered, service-owned list). null = flat pricing, no variant.
-- shape: { "axis_label": "Outfits", "tiers": [{ "label": "1 outfit", "price": 200 }, ...] }
alter table services add column pricing_variant jsonb;

-- Part 3: payment policy stops being force-defaulted. A service that
-- doesn't set one now genuinely has none — decided ad hoc when money
-- actually moves — rather than silently inheriting 'deposit' nobody chose.
alter table services alter column payment_policy drop not null;
alter table services alter column payment_policy drop default;

-- name is untouched — stays `not null`. It's the one field that always
-- resolves; the application layer guarantees a value (auto-composed or
-- studio-crafted) before every insert, so the database doesn't need to
-- know which kind it is.
