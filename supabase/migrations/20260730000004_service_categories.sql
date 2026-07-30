-- Grouping the catalogue, in the studio's own words.
--
-- A flat list is fine at six services and useless at thirty. Studios think in
-- groups — Weddings, Portraits, Commercial — and no two studios group the same
-- way, so this is studio-defined rather than a hardcoded enum.
--
-- Unlike booking stages, a category carries NO semantic kind: nothing in the
-- system reasons about "Weddings". It is purely how a studio arranges its own
-- shelf, so a name and an order is all it needs.
--
-- Nullable on the service: uncategorised is a legitimate state, and every
-- existing service starts there.

create table service_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_service_categories_org on service_categories(organization_id, position);

alter table service_categories enable row level security;
create policy "Tenant Isolation" on service_categories for all using (organization_id in (select auth_org_ids()));
create trigger trg_service_categories_updated before update on service_categories for each row execute function update_updated_at();

-- Deleting a category must never delete the services in it.
alter table services add column category_id uuid references service_categories(id) on delete set null;
