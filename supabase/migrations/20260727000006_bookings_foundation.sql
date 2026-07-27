-- The booking hub: the first-class spine a studio actually thinks in.
--
-- A booking is one piece of work for a client. It can exist from almost nothing
-- (a title) and grow — a lead is just a booking in an early state. It bundles
-- multiple service lines, each of which can have its own workflow. Everything
-- else (contract, money, work, deliverables) associates to the booking FREELY:
-- created in any order, optional, never forced. The booking is the connective
-- tissue that keeps independent things cohering into "a job".

-- ── Tables ───────────────────────────────────────────────────────────────────
create table bookings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  person_id       uuid references persons(id),            -- the client, once known
  title           text not null,                          -- a title alone is enough to exist
  status          text not null default 'draft',          -- coarse identity: draft/active/closed/cancelled
  scheduled_for   timestamptz,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_bookings_org on bookings(organization_id);
create index idx_bookings_person on bookings(person_id);

create table booking_lines (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id),
  booking_id          uuid not null references bookings(id) on delete cascade,
  service_template_id uuid references service_templates(id) on delete set null,  -- null = custom line
  title               text not null,
  price               jsonb not null default '{}',        -- snapshot: {base_price, currency, deposit_percentage}
  status              text not null default 'pending',
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_booking_lines_booking on booking_lines(booking_id);
create index idx_booking_lines_org on booking_lines(organization_id);

create trigger trg_bookings_updated before update on bookings for each row execute function update_updated_at();
create trigger trg_booking_lines_updated before update on booking_lines for each row execute function update_updated_at();

-- Tenant isolation (matches the kernel pattern; app uses the admin client but
-- these are the safety net per the Multi-Tenant Mandate).
alter table bookings enable row level security;
alter table booking_lines enable row level security;
create policy "Tenant Isolation" on bookings for all using (organization_id in (select auth_org_ids()));
create policy "Tenant Isolation" on booking_lines for all using (organization_id in (select auth_org_ids()));

-- ── Attach the aspects to the hub (all optional) ─────────────────────────────
alter table intents                add column booking_id uuid references bookings(id) on delete set null;
alter table contracts              add column booking_id uuid references bookings(id) on delete set null;
alter table workflows              add column booking_id uuid references bookings(id) on delete set null;
alter table workflows              add column booking_line_id uuid references booking_lines(id) on delete set null;
alter table financial_transactions add column booking_id uuid references bookings(id) on delete set null;
alter table deliverables           add column booking_id uuid references bookings(id) on delete set null;

create index idx_workflows_booking on workflows(booking_id);
create index idx_ft_booking on financial_transactions(booking_id);
create index idx_contracts_booking on contracts(booking_id);

-- ── Backfill: wrap existing engagements into bookings ────────────────────────
-- One booking per existing intent (the engagement's origin), tagged so we can
-- link everything back.
insert into bookings (organization_id, person_id, title, status, metadata, created_at)
select i.organization_id,
       i.person_id,
       coalesce(p.display_name, 'Booking') || ' — ' || coalesce(st.name, 'Custom'),
       case when i.status = 'accepted' then 'active' else 'draft' end,
       jsonb_build_object('backfill_intent_id', i.id::text),
       i.created_at
from intents i
left join persons p on p.id = i.person_id
left join service_templates st on st.id = i.service_template_id;

update intents i
set booking_id = b.id
from bookings b
where (b.metadata->>'backfill_intent_id') = i.id::text;

update contracts c
set booking_id = i.booking_id
from intents i
where c.intent_id = i.id and c.booking_id is null;

-- One line per backfilled booking, from the intent's requested service.
insert into booking_lines (organization_id, booking_id, service_template_id, title, price, created_at)
select b.organization_id,
       b.id,
       i.service_template_id,
       coalesce(st.name, 'Service'),
       coalesce(st.pricing, '{}'::jsonb),
       b.created_at
from bookings b
join intents i on i.id::text = (b.metadata->>'backfill_intent_id')
left join service_templates st on st.id = i.service_template_id
where b.metadata ? 'backfill_intent_id';

-- Propagate the booking id down to the aspects (through their contract).
update workflows w              set booking_id = c.booking_id from contracts c where w.contract_id = c.id and w.booking_id is null;
update financial_transactions t set booking_id = c.booking_id from contracts c where t.contract_id = c.id and t.booking_id is null;
update deliverables d           set booking_id = c.booking_id from contracts c where d.contract_id = c.id and d.booking_id is null;

-- Point each backfilled workflow at its booking's line.
update workflows w
set booking_line_id = bl.id
from booking_lines bl
where bl.booking_id = w.booking_id and w.booking_line_id is null;
