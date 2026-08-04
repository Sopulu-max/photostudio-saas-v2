-- Extras: optional add-ons a client can attach to a service — an extra hour,
-- a printed album, rush delivery. Not a new sellable concept of its own; it
-- only exists in relation to the service that carries it, so it dies with
-- that service (cascade) rather than needing its own retirement lifecycle.
--
-- Consumption reuses booking_lines exactly as a custom line already does:
-- an extra becomes a line with its own snapshotted title/price/quantity.
-- No change to booking_lines or addBookingLine was needed for this.

create table service_extras (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  service_id      uuid not null references services(id) on delete cascade,
  name            text not null,
  price           numeric not null default 0,
  price_unit      text,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_service_extras_service on service_extras(service_id, position);
create index idx_service_extras_org on service_extras(organization_id);

alter table service_extras enable row level security;
create policy "Tenant Isolation" on service_extras for all using (organization_id in (select auth_org_ids()));
create trigger trg_service_extras_updated before update on service_extras for each row execute function update_updated_at();
