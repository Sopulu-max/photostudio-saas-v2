-- Puts back what I dropped too early.
--
-- 20260822000000 removed the fifteen subject/occasion/context/purpose/client
-- tables while roughly sixty places in src/ still query them. The schema went
-- ahead of the code, so Services and Packages both error. That is my
-- sequencing mistake, not a design change: dimensions/dimension_values remain
-- the destination, and this restores the old shape only so the app runs while
-- the module layer moves.
--
-- Rebuilt FROM the new tables, so nothing is invented and nothing is lost —
-- and because the new model has been the truth since the backfill, this is a
-- projection of it rather than a second source. It gets deleted again, for
-- real, in the same commit that moves the code.

create table if not exists subjects (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    name text not null, position integer default 0, parent_id uuid,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (organization_id, name)
);
create table if not exists occasions (like subjects including all);
create table if not exists service_contexts (like subjects including all);
create table if not exists purposes (like subjects including all);
create table if not exists client_types (like subjects including all);

-- Values come back out of dimension_values, deduplicated across domains: the
-- old tables were studio-wide, so Photography's "Person" and Videography's
-- collapse back into one row, which is exactly the flattening the new model
-- exists to undo.
insert into subjects (organization_id, name, position)
select distinct on (v.organization_id, lower(v.name)) v.organization_id, v.name, v.position
from dimension_values v join dimensions d on d.id = v.dimension_id where d.name = 'Subject'
on conflict do nothing;
insert into occasions (organization_id, name, position)
select distinct on (v.organization_id, lower(v.name)) v.organization_id, v.name, v.position
from dimension_values v join dimensions d on d.id = v.dimension_id where d.name = 'Occasion'
on conflict do nothing;
insert into service_contexts (organization_id, name, position)
select distinct on (v.organization_id, lower(v.name)) v.organization_id, v.name, v.position
from dimension_values v join dimensions d on d.id = v.dimension_id where d.name = 'Context'
on conflict do nothing;
insert into purposes (organization_id, name, position)
select distinct on (v.organization_id, lower(v.name)) v.organization_id, v.name, v.position
from dimension_values v join dimensions d on d.id = v.dimension_id where d.name = 'Purpose'
on conflict do nothing;
insert into client_types (organization_id, name, position)
select distinct on (v.organization_id, lower(v.name)) v.organization_id, v.name, v.position
from dimension_values v join dimensions d on d.id = v.dimension_id where d.name = 'Client'
on conflict do nothing;

create table if not exists service_schema_subjects (
    organization_id uuid not null references organizations(id) on delete cascade,
    service_id uuid not null references services(id) on delete cascade,
    subject_id uuid not null references subjects(id) on delete cascade,
    primary key (service_id, subject_id)
);
create table if not exists service_schema_occasions (
    organization_id uuid not null references organizations(id) on delete cascade,
    service_id uuid not null references services(id) on delete cascade,
    occasion_id uuid not null references occasions(id) on delete cascade,
    primary key (service_id, occasion_id)
);
create table if not exists service_schema_contexts (
    organization_id uuid not null references organizations(id) on delete cascade,
    service_id uuid not null references services(id) on delete cascade,
    context_id uuid not null references service_contexts(id) on delete cascade,
    primary key (service_id, context_id)
);
create table if not exists service_schema_purposes (
    organization_id uuid not null references organizations(id) on delete cascade,
    service_id uuid not null references services(id) on delete cascade,
    purpose_id uuid not null references purposes(id) on delete cascade,
    primary key (service_id, purpose_id)
);
create table if not exists service_schema_client_types (
    organization_id uuid not null references organizations(id) on delete cascade,
    service_id uuid not null references services(id) on delete cascade,
    client_type_id uuid not null references client_types(id) on delete cascade,
    primary key (service_id, client_type_id)
);

insert into service_schema_subjects (organization_id, service_id, subject_id)
select sdv.organization_id, sdv.service_id, f.id from service_dimension_values sdv
join dimension_values v on v.id = sdv.dimension_value_id
join dimensions d on d.id = v.dimension_id and d.name = 'Subject'
join subjects f on f.organization_id = sdv.organization_id and lower(f.name) = lower(v.name)
on conflict do nothing;
insert into service_schema_occasions (organization_id, service_id, occasion_id)
select sdv.organization_id, sdv.service_id, f.id from service_dimension_values sdv
join dimension_values v on v.id = sdv.dimension_value_id
join dimensions d on d.id = v.dimension_id and d.name = 'Occasion'
join occasions f on f.organization_id = sdv.organization_id and lower(f.name) = lower(v.name)
on conflict do nothing;
insert into service_schema_contexts (organization_id, service_id, context_id)
select sdv.organization_id, sdv.service_id, f.id from service_dimension_values sdv
join dimension_values v on v.id = sdv.dimension_value_id
join dimensions d on d.id = v.dimension_id and d.name = 'Context'
join service_contexts f on f.organization_id = sdv.organization_id and lower(f.name) = lower(v.name)
on conflict do nothing;
insert into service_schema_purposes (organization_id, service_id, purpose_id)
select sdv.organization_id, sdv.service_id, f.id from service_dimension_values sdv
join dimension_values v on v.id = sdv.dimension_value_id
join dimensions d on d.id = v.dimension_id and d.name = 'Purpose'
join purposes f on f.organization_id = sdv.organization_id and lower(f.name) = lower(v.name)
on conflict do nothing;
insert into service_schema_client_types (organization_id, service_id, client_type_id)
select sdv.organization_id, sdv.service_id, f.id from service_dimension_values sdv
join dimension_values v on v.id = sdv.dimension_value_id
join dimensions d on d.id = v.dimension_id and d.name = 'Client'
join client_types f on f.organization_id = sdv.organization_id and lower(f.name) = lower(v.name)
on conflict do nothing;

create table if not exists package_subjects (
    organization_id uuid not null references organizations(id) on delete cascade,
    package_id uuid not null references packages(id) on delete cascade,
    subject_id uuid not null references subjects(id) on delete cascade,
    primary key (package_id, subject_id)
);
create table if not exists package_occasions (
    organization_id uuid not null references organizations(id) on delete cascade,
    package_id uuid not null references packages(id) on delete cascade,
    occasion_id uuid not null references occasions(id) on delete cascade,
    primary key (package_id, occasion_id)
);
create table if not exists package_contexts (
    organization_id uuid not null references organizations(id) on delete cascade,
    package_id uuid not null references packages(id) on delete cascade,
    context_id uuid not null references service_contexts(id) on delete cascade,
    primary key (package_id, context_id)
);
create table if not exists package_purposes (
    organization_id uuid not null references organizations(id) on delete cascade,
    package_id uuid not null references packages(id) on delete cascade,
    purpose_id uuid not null references purposes(id) on delete cascade,
    primary key (package_id, purpose_id)
);
create table if not exists package_client_types (
    organization_id uuid not null references organizations(id) on delete cascade,
    package_id uuid not null references packages(id) on delete cascade,
    client_type_id uuid not null references client_types(id) on delete cascade,
    primary key (package_id, client_type_id)
);

alter table organizations add column if not exists enabled_dimensions text[];
update organizations o
set enabled_dimensions = (
    select array_agg(distinct lower(d.name)) from dimensions d
    where d.organization_id = o.id and d.is_active
)
where o.enabled_dimensions is null;

-- Output types were re-seeded per domain and the old code reads them
-- studio-wide by name; the duplicates are harmless to it and correct for the
-- new model, so they stay as they are.

alter table subjects enable row level security;
alter table occasions enable row level security;
alter table service_contexts enable row level security;
alter table purposes enable row level security;
alter table client_types enable row level security;
alter table service_schema_subjects enable row level security;
alter table service_schema_occasions enable row level security;
alter table service_schema_contexts enable row level security;
alter table service_schema_purposes enable row level security;
alter table service_schema_client_types enable row level security;
alter table package_subjects enable row level security;
alter table package_occasions enable row level security;
alter table package_contexts enable row level security;
alter table package_purposes enable row level security;
alter table package_client_types enable row level security;

do $$
declare t text;
begin
    foreach t in array array['subjects','occasions','service_contexts','purposes','client_types',
        'service_schema_subjects','service_schema_occasions','service_schema_contexts',
        'service_schema_purposes','service_schema_client_types',
        'package_subjects','package_occasions','package_contexts','package_purposes','package_client_types']
    loop
        execute format('drop policy if exists "Tenant Isolation" on %I', t);
        execute format('create policy "Tenant Isolation" on %I for select using (organization_id in (select auth_org_ids()))', t);
    end loop;
end $$;
