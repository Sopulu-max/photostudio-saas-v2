-- A question belongs to the studio, and a domain says which questions it asks.
--
-- WHAT WAS WRONG. A dimension carried a service_domain_id, so "Occasion" was
-- not one question a studio asks — it was one question per kind of work. This
-- studio holds two: Photography's Occasion, with Birthday, Burial, Anniversary,
-- Convocation and Maternity, and Videography's Occasion, with Birthday and
-- Burial. Two rows called Birthday, with different ids, unrelated to each
-- other.
--
-- The second list is shorter than the first for no reason anybody chose. It was
-- seeded alongside the domain and then only ever extended on the photography
-- side, because adding a value to one list does not add it to the other. That
-- is not two studios disagreeing about what a birthday is; it is the same fact
-- typed in two places and maintained in one.
--
-- The costs were about to become real. Tagging videography work "Anniversary"
-- means typing it again. Asking for every birthday job returns only half of
-- them. And anything hung off a dimension — a date on an occasion, which is
-- what prompted this — would have to be declared once per domain and would
-- attach to one Birthday or the other.
--
-- WHAT IT IS NOW. A dimension belongs to the organization. A domain declares
-- which dimensions it asks, through a join. So a studio has one Occasion, with
-- one Birthday, and both Photography and Videography classify by it — while a
-- domain that genuinely asks something nobody else does simply links to fewer.
--
-- Values are merged by name within the surviving dimension, and everything
-- pointing at a merged-away value is repointed rather than dropped. No service
-- and no package loses a classification.

-- ── which domains ask which questions ──────────────────────────────────────
create table if not exists service_domain_dimensions (
  organization_id  uuid not null references organizations(id) on delete cascade,
  service_domain_id uuid not null references service_domains(id) on delete cascade,
  dimension_id     uuid not null references dimensions(id) on delete cascade,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  primary key (service_domain_id, dimension_id)
);

create index if not exists service_domain_dimensions_dimension_idx
  on service_domain_dimensions (dimension_id);

-- Every dimension keeps the domain it had, so nothing changes shape yet.
insert into service_domain_dimensions (organization_id, service_domain_id, dimension_id, position)
select d.organization_id, d.service_domain_id, d.id, d.position
from dimensions d
where d.service_domain_id is not null
on conflict do nothing;

-- ── one question per name, per studio ──────────────────────────────────────
-- The survivor is the copy carrying the most values, then the oldest, so the
-- fuller list wins and merging is stable however often this is re-run.
create temporary table dimension_merge as
with ranked as (
  select
    d.id,
    d.organization_id,
    first_value(d.id) over (
      partition by d.organization_id, lower(btrim(d.name))
      order by (select count(*) from dimension_values dv where dv.dimension_id = d.id) desc,
               d.created_at asc, d.id asc
    ) as survivor_id
  from dimensions d
)
select id, survivor_id, organization_id from ranked where id <> survivor_id;

-- ── one answer per name, per surviving question ────────────────────────────
-- MERGED BEFORE MOVED, not after. dimension_values is unique on
-- (dimension_id, lower(name)), so carrying Videography Birthday across to
-- Photography Occasion while a Birthday already sits there collides — the
-- values have to be reconciled against the dimension they are HEADED for, not
-- the one they are leaving.
create temporary table value_target as
select dv.id, dv.name, dv.created_at,
       coalesce(m.survivor_id, dv.dimension_id) as target_dimension_id
from dimension_values dv
left join dimension_merge m on m.id = dv.dimension_id;

create temporary table value_merge as
with ranked as (
  select
    vt.id,
    first_value(vt.id) over (
      partition by vt.target_dimension_id, lower(btrim(vt.name))
      order by (
        (select count(*) from service_dimension_values x where x.dimension_value_id = vt.id) +
        (select count(*) from package_service_dimension_values y where y.dimension_value_id = vt.id)
      ) desc, vt.created_at asc, vt.id asc
    ) as survivor_id
  from value_target vt
)
select id, survivor_id from ranked where id <> survivor_id;

-- Repointed, never dropped: a service classified by a merged-away value stays
-- classified, by the value that survived.
update service_dimension_values sdv set dimension_value_id = v.survivor_id
from value_merge v
where sdv.dimension_value_id = v.id
  and not exists (
    select 1 from service_dimension_values other
    where other.service_id = sdv.service_id and other.dimension_value_id = v.survivor_id
  );
delete from service_dimension_values sdv using value_merge v where sdv.dimension_value_id = v.id;

update package_service_dimension_values psdv set dimension_value_id = v.survivor_id
from value_merge v
where psdv.dimension_value_id = v.id
  and not exists (
    select 1 from package_service_dimension_values other
    where other.package_service_id = psdv.package_service_id
      and other.dimension_value_id = v.survivor_id
  );
delete from package_service_dimension_values psdv using value_merge v where psdv.dimension_value_id = v.id;

update dimension_values child set parent_id = v.survivor_id
from value_merge v where child.parent_id = v.id;

delete from dimension_values dv using value_merge v where dv.id = v.id;

-- Now nothing collides, so what is left can move to the question that survived.
update dimension_values dv set dimension_id = vt.target_dimension_id
from value_target vt
where dv.id = vt.id and dv.dimension_id <> vt.target_dimension_id;

-- ── and the questions themselves ───────────────────────────────────────────
-- A domain that asked a merged-away question now asks the survivor.
update service_domain_dimensions sdd
set dimension_id = m.survivor_id
from dimension_merge m
where sdd.dimension_id = m.id
  and not exists (
    select 1 from service_domain_dimensions other
    where other.service_domain_id = sdd.service_domain_id
      and other.dimension_id = m.survivor_id
  );
delete from service_domain_dimensions sdd using dimension_merge m where sdd.dimension_id = m.id;

-- An active copy makes the survivor active: a question one domain still asks
-- is a question the studio still asks.
update dimensions s set is_active = true
where exists (
  select 1 from dimension_merge m join dimensions loser on loser.id = m.id
  where m.survivor_id = s.id and loser.is_active
);

delete from dimensions d using dimension_merge m where d.id = m.id;

-- ── the column that made a question belong to one kind of work ─────────────
-- Kept, nullable and unused, rather than dropped in the same breath as the code
-- that stops reading it: a deploy takes minutes, and a column removed before
-- the last reader is gone is an outage rather than a tidy-up.
alter table dimensions alter column service_domain_id drop not null;

comment on column dimensions.service_domain_id is
  'RETIRED. A dimension belongs to the studio; service_domain_dimensions says which domains ask it. Left in place until the next migration so no deployed reader can trip over its absence.';
