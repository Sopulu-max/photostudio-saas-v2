-- A family of packages, and what it leaves to its members.
--
-- A studio sells tiers: 1 outfit / 2 outfits / 3 outfits; Bronze / Silver /
-- Gold; Studio / Outdoor. Until now each tier was an island - a package with no
-- relation to the next - and a new one started from a blank form. The only
-- edge between packages was instance_of, which is provenance (a booking's copy
-- points at the catalogue package it came from), not a relation between offers.
--
-- THE RULE. Every row a package holds has a decider: fixed here, or left to
-- the member. A package with anything left to the member is a FAMILY; a
-- package with nothing left is sellable. A MEMBER declares nothing - it holds
-- only its answers to what was left to it, and member_of. Its services, its
-- classification, its promises, its tasks and its booking form are the
-- family's, read through member_of. Change the family and every member
-- changes, always, because none of them ever had a copy.
--
-- What can be left to a member (this migration): a bundled service (in / out),
-- a promise's quantity, a variable's answer, and - always - the price, the name
-- and the pictures. Narrowings and tasks are inherited whole for now.
--
-- WHERE A MEMBER'S ANSWERS LIVE. Not on the family's rows. Every reader of
-- package_variable_values and package_deliverables embeds them from
-- package_services, and a member row tagged onto those tables would come back
-- inside every such embed, for every reader, without any of them asking. So the
-- answers have a table of their own, keyed by the member and the family's
-- bundle row, and one resolver applies them. Existing rows are untouched and
-- already correct: nothing is a family or a member until a studio says so.
--
-- A member is not an instance and an instance is not a member: a booking's
-- instance of a member is a materialised copy (member resolved through its
-- family, then copied), so a booking made in March does not move when the
-- family changes in June.

alter table packages
  add column if not exists member_of uuid references packages(id) on delete restrict;

alter table packages drop constraint if exists packages_member_not_self;
alter table packages
  add constraint packages_member_not_self check (member_of is null or member_of <> id);

alter table packages drop constraint if exists packages_member_or_instance;
alter table packages
  add constraint packages_member_or_instance check (member_of is null or instance_of is null);

create index if not exists packages_member_of on packages (member_of) where member_of is not null;

comment on column packages.member_of is
  'The family this package is a member of. A member declares no structure of its own: services, promises, classification, tasks and form are the family''s, and the member holds only its answers (package_member_answers), its price, its name and its pictures. Null: standalone, or a family.';

-- ── What a family leaves to its members ─────────────────────────────────────

alter table package_services
  add column if not exists decided_by text not null default 'studio';
alter table package_services drop constraint if exists package_services_decided_by_check;
alter table package_services
  add constraint package_services_decided_by_check check (decided_by in ('studio', 'member'));
comment on column package_services.decided_by is
  'studio: bundled. member: whether this service is in or out is left to each member.';

alter table package_deliverables
  add column if not exists decided_by text not null default 'studio';
alter table package_deliverables drop constraint if exists package_deliverables_decided_by_check;
alter table package_deliverables
  add constraint package_deliverables_decided_by_check check (decided_by in ('studio', 'member'));
comment on column package_deliverables.decided_by is
  'studio: the quantity here is the promise. member: the quantity is left to each member (0 = not promised by that member).';

-- The fourth decider on a variable. Like client, it carries no value here.
alter table package_variable_values
  drop constraint if exists package_variable_values_answered_by_check;
alter table package_variable_values
  add constraint package_variable_values_answered_by_check
  check (
    (answered_by = 'studio' and value is not null)
    or (answered_by in ('client', 'member') and value is null)
  );
comment on column package_variable_values.answered_by is
  'studio: the package fixes this value. client: the package asks it at booking. member: the package is a family and leaves it to each member, who then fixes it or asks the client. No row at all: nobody has decided, and it is asked of no one.';

-- ── A member's answers ──────────────────────────────────────────────────────

create table if not exists package_member_answers (
  organization_id     uuid not null references organizations(id) on delete cascade,
  member_id           uuid not null references packages(id) on delete cascade,
  -- The family's bundle row the answer is about. Cascade: a service dropped
  -- from the family takes every member's answers about it.
  package_service_id  uuid not null references package_services(id) on delete cascade,
  kind                text not null check (kind in ('service', 'promise', 'variable')),
  -- deliverable_id for a promise, variable_id for a variable, null for the service itself.
  ref_id              uuid,
  -- service: true (in) or false (out). promise: the quantity. variable: the
  -- value, or null when the member hands the question to the client.
  value               jsonb,
  answered_by         text not null default 'studio' check (answered_by in ('studio', 'client')),
  created_at          timestamptz not null default now(),

  check ((kind = 'service' and ref_id is null) or (kind <> 'service' and ref_id is not null)),
  check (kind = 'variable' or answered_by = 'studio'),
  check ((answered_by = 'studio' and value is not null) or (answered_by = 'client' and value is null))
);

create unique index if not exists package_member_answers_one
  on package_member_answers (member_id, package_service_id, kind, coalesce(ref_id, '00000000-0000-0000-0000-000000000000'));
create index if not exists package_member_answers_member on package_member_answers (member_id);

alter table package_member_answers enable row level security;
drop policy if exists "Tenant Isolation" on package_member_answers;
create policy "Tenant Isolation" on package_member_answers
  for all using (organization_id in (select auth_org_ids()));

comment on table package_member_answers is
  'What a member of a family answered to what the family left to it: a service in or out, a promise''s quantity, a variable''s value (or that the client answers it). A member has no bundle rows; the family''s are referenced.';
