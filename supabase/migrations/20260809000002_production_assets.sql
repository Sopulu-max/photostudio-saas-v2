-- Production Assets - The physical reality of the Production Plane
--
-- This formalizes the provenance and lineage of an output. An asset is an instance
-- of an output_type. It knows what task produced it, and what previous asset
-- it was derived from.

create table assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  booking_id uuid not null references bookings(id) on delete cascade,
  
  -- The Semantic definition of what this is
  output_type_id uuid references output_types(id) on delete set null,
  
  
  -- Provenance (Lineage)
  produced_by_task_id uuid references tasks(id) on delete set null,
  derived_from_asset_id uuid references assets(id) on delete set null,
  
  -- The physical manifestation
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  
  -- State machine for the asset
  state text not null default 'draft',
  
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_assets_org on assets(organization_id);
create index idx_assets_booking on assets(booking_id);
create index idx_assets_produced_by on assets(produced_by_task_id);
create index idx_assets_derived_from on assets(derived_from_asset_id);
create index idx_assets_type on assets(output_type_id);

alter table assets enable row level security;
create policy "Tenant Isolation" on assets for all using (organization_id in (select auth_org_ids()));

create trigger trg_assets_updated before update on assets for each row execute function update_updated_at();

-- Delivery Containers simply reference Production Assets. 
-- The asset exists independently of its delivery to the client.
create table delivery_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  delivery_id uuid not null references deliveries(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_delivery_assets_org on delivery_assets(organization_id);
create index idx_delivery_assets_delivery on delivery_assets(delivery_id);
create index idx_delivery_assets_asset on delivery_assets(asset_id);

alter table delivery_assets enable row level security;
create policy "Tenant Isolation" on delivery_assets for all using (organization_id in (select auth_org_ids()));

-- Drop the old delivery_files as it bypassed the Production Plane
drop table if exists delivery_files cascade;
