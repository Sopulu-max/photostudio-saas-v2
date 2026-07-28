-- Delivery module — handing finished work to the client.
--
-- A delivery is a named bundle of files handed over for a booking ("Final
-- selects"), with its own share link and state. A booking can have several
-- (sneak peeks, then the final gallery). Files stay private in storage; the
-- client gallery is served through short-lived signed URLs, so nothing is
-- publicly readable and the share link is the only capability.

create table deliveries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  booking_id      uuid not null references bookings(id) on delete cascade,
  title           text not null,
  status          text not null default 'draft',   -- draft / shared / archived
  share_token     text unique,                     -- set when shared
  shared_at       timestamptz,
  last_viewed_at  timestamptz,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_deliveries_org on deliveries(organization_id);
create index idx_deliveries_booking on deliveries(booking_id);

create table delivery_files (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  delivery_id     uuid not null references deliveries(id) on delete cascade,
  storage_path    text not null,
  file_name       text not null,
  mime_type       text,
  size_bytes      bigint,
  created_at      timestamptz not null default now()
);
create index idx_delivery_files_delivery on delivery_files(delivery_id);

alter table deliveries enable row level security;
alter table delivery_files enable row level security;
create policy "Tenant Isolation" on deliveries for all using (organization_id in (select auth_org_ids()));
create policy "Tenant Isolation" on delivery_files for all using (organization_id in (select auth_org_ids()));

create trigger trg_deliveries_updated before update on deliveries for each row execute function update_updated_at();

-- Private bucket for delivered files; the gallery uses signed URLs.
insert into storage.buckets (id, name, public) values ('deliveries', 'deliveries', false)
on conflict (id) do nothing;

create policy "Authenticated users can upload deliveries"
on storage.objects for insert to authenticated with check (bucket_id = 'deliveries');

create policy "Authenticated users can view deliveries"
on storage.objects for select to authenticated using (bucket_id = 'deliveries');

create policy "Authenticated users can delete deliveries"
on storage.objects for delete to authenticated using (bucket_id = 'deliveries');
