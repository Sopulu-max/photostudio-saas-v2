-- A service is never priced. A unit of the way it varies can be.
--
-- The ontology says why a service has no price - its price depends on its
-- configuration - and stopped there. So every attempt at "extras" had to
-- invent a priced unit somewhere local: a service_extras table (20260730,
-- dropped 20260805), a package_extras catalogue (20261101, dropped 20261102),
-- a booking line pointing at a bare service or deliverable (20261102, dropped
-- 20261103). None could draw structure from anything, because nothing in the
-- schema priced a unit.
--
-- This is that primitive: a RATE, the price of one unit of variation, held
-- where the variation is declared. On a variable: per unit above what a
-- package fixes (a number), or per option (a choice). On what a service
-- produces (service_deliverables): per unit of the deliverable's unit. The
-- same deliverable made by two services can carry two rates - the rate is the
-- producing service's. Declared once, the studio's tariff.
--
-- Packages still select and never redefine: a package fixes quantities and
-- states one figure for the bundle. Rates inform that figure and never set
-- it. A rate decides on its own only beyond the package: what a client takes
-- above what was fixed, what a package leaves the client to choose at a price.
--
-- The money shape is the one every price here uses - { base_price, currency }
-- read by kernel/money priceOf - so there is one parser, not a second.
--
-- Expand only. Every column is nullable: a variable without a rate is simply
-- not purchasable beyond what is fixed. Nothing existing changes meaning.

-- ── The tariff ───────────────────────────────────────────────────────────────

alter table variables
  add column if not exists rate jsonb,
  add column if not exists option_rates jsonb;

comment on column variables.rate is
  'Money per unit above what a package fixes (a number kind), or for "yes" (a boolean). Null: no extra of this can be taken.';
comment on column variables.option_rates is
  'A choice kind: { option: Money } for each option that costs more than the one a package fixes. Null or missing option: no charge.';

alter table service_deliverables
  add column if not exists rate jsonb;

comment on column service_deliverables.rate is
  'Money per unit of this deliverable when this service produces one beyond what a package promises. The rate is the producing service''s.';

-- ── What a booking took beyond its package ───────────────────────────────────
--
-- The ledger. A row is one departure from what the instance fixed: this row
-- of the instance's bundle, this many units, at this rate, frozen at the
-- moment it was taken. The instance's own rows carry the effective quantity
-- for production (raised when the extra is taken, lowered when it is
-- withdrawn); this table carries the money and the provenance. list_price on
-- the instance stays what the package was worth; price stays what was
-- agreed for it; the extras are read from here.

create table if not exists booking_line_extras (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  booking_line_id     uuid not null references booking_lines(id) on delete cascade,
  -- The instance's bundle row the departure is from: the service through
  -- which the unit is produced or the variable is declared.
  package_service_id  uuid not null references package_services(id) on delete cascade,
  kind                text not null check (kind in ('variable', 'promise')),
  -- variable_id for a variable, deliverable_id for a promise.
  ref_id              uuid not null,
  -- For a choice: the option taken. Null for a count.
  value               jsonb,
  units               numeric not null default 1 check (units > 0),
  -- Money, frozen: the rate at the moment of taking.
  unit_rate           jsonb not null,
  -- How it read when taken, so a document can say it without resolving.
  label               text not null,
  created_at          timestamptz not null default now()
);

create index if not exists booking_line_extras_line on booking_line_extras (booking_line_id);
alter table booking_line_extras enable row level security;
drop policy if exists "Tenant Isolation" on booking_line_extras;
create policy "Tenant Isolation" on booking_line_extras
  for all using (organization_id in (select auth_org_ids()));

comment on table booking_line_extras is
  'What a booking took beyond what its package fixed: one row per departure, units at a rate frozen at take. The instance''s rows carry the effective quantities; this carries the money and the provenance.';
