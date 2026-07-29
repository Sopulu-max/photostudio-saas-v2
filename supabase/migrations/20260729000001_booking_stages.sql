-- Booking stages — the lifecycle stops being hardcoded.
--
-- A studio names its own stages ("Quote sent", "Shoot day", "In edit"). The
-- system never reasons about those names: each stage carries a KIND from a
-- small fixed vocabulary, and every consumer asks about the kind instead.
-- Rename a stage and nothing breaks.
--
--   kind: enquiry   — interested, nothing committed
--         booked    — it's happening, it's in the diary
--         completed — done and handed over
--         cancelled — it didn't happen
--
-- Many stages, few kinds: "Booked in", "Shoot day" and "In edit" can all be
-- kind 'booked' — different to the studio, the same to the calendar.

create table booking_stages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  kind            text not null check (kind in ('enquiry','booked','completed','cancelled')),
  position        integer not null default 0,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_booking_stages_org on booking_stages(organization_id, position);

alter table booking_stages enable row level security;
create policy "Tenant Isolation" on booking_stages for all using (organization_id in (select auth_org_ids()));
create trigger trg_booking_stages_updated before update on booking_stages for each row execute function update_updated_at();

-- Out-of-the-box defaults for every existing studio (opinionated, renameable).
insert into booking_stages (organization_id, name, kind, position, is_default)
select o.id, s.name, s.kind, s.position, s.is_default
from organizations o
cross join (values
  ('Enquiry',   'enquiry',   0, true),
  ('Booked',    'booked',    1, false),
  ('Completed', 'completed', 2, false),
  ('Cancelled', 'cancelled', 3, false)
) as s(name, kind, position, is_default);

-- Bookings point at a stage.
alter table bookings add column stage_id uuid references booking_stages(id);

-- Carry the old free-text status across to the matching stage.
update bookings b
set stage_id = st.id
from booking_stages st
where st.organization_id = b.organization_id
  and st.kind = case b.status
    when 'inquiry'   then 'enquiry'
    when 'draft'     then 'enquiry'
    when 'active'    then 'booked'
    when 'closed'    then 'completed'
    when 'cancelled' then 'cancelled'
    else 'enquiry'
  end;

-- Anything unmatched lands on the studio's default stage.
update bookings b
set stage_id = st.id
from booking_stages st
where b.stage_id is null
  and st.organization_id = b.organization_id
  and st.is_default;

alter table bookings alter column stage_id set not null;
create index idx_bookings_stage on bookings(stage_id);

-- The free-text status is gone; the stage is the truth.
alter table bookings drop column status;
