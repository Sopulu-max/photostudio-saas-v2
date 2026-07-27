-- Kernel · Contacts — the thin shared party base (the "who"), à la Odoo res.partner.
--
-- Identity only: name and the ways to reach someone, plus the login link. All the
-- depth lives in the modules that specialise on top (Clients, Team) — delegation
-- over duplication. This is the first brick of the modular rebuild.
create table contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  display_name    text not null,
  email           text,
  phone           text,
  avatar_url      text,
  auth_user_id    uuid references auth.users(id),
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_contacts_org on contacts(organization_id);
create index idx_contacts_email on contacts(organization_id, email);

alter table contacts enable row level security;
create policy "Tenant Isolation" on contacts for all using (organization_id in (select auth_org_ids()));
create trigger trg_contacts_updated before update on contacts for each row execute function update_updated_at();

-- Backfill: every existing person becomes a contact. Non-destructive — persons
-- stays until the Clients/Team modules fully replace it. Tag origin for linking.
insert into contacts (organization_id, display_name, email, phone, auth_user_id, metadata, created_at)
select organization_id, display_name, email, phone, auth_user_id,
       jsonb_build_object('backfill_person_id', id::text), created_at
from persons;
