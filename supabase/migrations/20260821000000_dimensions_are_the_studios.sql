-- Dimensions stop being five things the engine owns.
--
-- DIMENSIONS was a closed set — subject, occasion, context, purpose, client —
-- and the closure was baked into storage, not just a TypeScript union: five
-- columns on services, five junction tables on packages, five separate value
-- tables, and an enabled_dimensions array of those five literals. A studio
-- wanting to classify by Style, or Season, or Turnaround could not add a row
-- anywhere. It had to be a schema change.
--
-- That contradicts what a service domain is meant to be. A studio chooses
-- Photography and should be able to expand as far into it as it likes — new
-- services, new ways of asking about them, new values under those. The engine
-- seeds knowledge; it doesn't set the ceiling.
--
-- So: two generic tables replace the five-of-everything, and a dimension can
-- belong to a domain (Season matters to Photography, Format to Printing) or to
-- the whole studio (Client matters everywhere).
--
-- THIS MIGRATION IS ADDITIVE. It creates and backfills; it drops nothing. The
-- old columns and junctions stay the source of truth until the module layer
-- moves over, so the app keeps working while the two are briefly parallel.
-- The follow-up migration drops them, and until it runs nothing should write
-- to the new tables — a populated shadow, not a second opinion.

create table if not exists dimensions (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references organizations(id) on delete cascade,

    -- Null means studio-wide: it applies whatever domain a service belongs to.
    -- Set means it only appears for services under that domain.
    service_domain_id uuid references service_domains(id) on delete cascade,

    name              text not null,
    -- How it reads when asked. Seeded for the five, the studio's own words after.
    question          text,
    example           text,

    -- Off rather than deleted: a studio that stops classifying by Occasion
    -- shouldn't lose which services were weddings.
    is_active         boolean not null default true,
    position          integer not null default 0,
    created_at        timestamptz not null default now()
);

create unique index if not exists dimensions_unique_name
    on dimensions(organization_id, coalesce(service_domain_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index if not exists idx_dimensions_org on dimensions(organization_id, is_active);

create table if not exists dimension_values (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references organizations(id) on delete cascade,
    dimension_id     uuid not null references dimensions(id) on delete cascade,
    name             text not null,
    -- Hierarchy was already possible on the old facet tables and is kept:
    -- Outdoor > Beach is a real thing a studio wants to say.
    parent_id        uuid references dimension_values(id) on delete set null,
    position         integer not null default 0,
    created_at       timestamptz not null default now()
);

create unique index if not exists dimension_values_unique_name
    on dimension_values(dimension_id, lower(name));
create index if not exists idx_dimension_values_dim on dimension_values(dimension_id);

-- One link table each, replacing five columns and five junctions.
create table if not exists service_dimension_values (
    organization_id    uuid not null references organizations(id) on delete cascade,
    service_id         uuid not null references services(id) on delete cascade,
    dimension_value_id uuid not null references dimension_values(id) on delete cascade,
    created_at         timestamptz not null default now(),
    primary key (service_id, dimension_value_id)
);
create index if not exists idx_sdv_org on service_dimension_values(organization_id);

create table if not exists package_dimension_values (
    organization_id    uuid not null references organizations(id) on delete cascade,
    package_id         uuid not null references packages(id) on delete cascade,
    dimension_value_id uuid not null references dimension_values(id) on delete cascade,
    created_at         timestamptz not null default now(),
    primary key (package_id, dimension_value_id)
);
create index if not exists idx_pdv_org on package_dimension_values(organization_id);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- The five become ordinary rows, studio-wide, seeded with the wording they
-- already had. From here they are deletable, renameable and joinable by the
-- studio's own — the engine ships them, it no longer owns them.

insert into dimensions (organization_id, service_domain_id, name, question, example, position)
select o.id, null, d.name, d.question, d.example, d.position
from organizations o
cross join (values
    ('Subject',  'What is being photographed?',        'Person, Product, Building', 0),
    ('Occasion', 'What occasion is it for?',           'Wedding, Birthday',         1),
    ('Context',  'Where, and under what conditions?',  'Studio, Outdoor',           2),
    ('Purpose',  'What is it for?',                    'Passport, Advertising',     3),
    ('Client',   'Who is the client?',                 'Individual, Corporate',     4)
) as d(name, question, example, position)
on conflict do nothing;

-- Values move under their dimension, keeping their own hierarchy.
insert into dimension_values (organization_id, dimension_id, name, position)
select s.organization_id, dim.id, s.name, coalesce(s.position, 0)
from subjects s
join dimensions dim on dim.organization_id = s.organization_id and dim.name = 'Subject' and dim.service_domain_id is null
on conflict do nothing;

insert into dimension_values (organization_id, dimension_id, name, position)
select x.organization_id, dim.id, x.name, coalesce(x.position, 0)
from occasions x
join dimensions dim on dim.organization_id = x.organization_id and dim.name = 'Occasion' and dim.service_domain_id is null
on conflict do nothing;

insert into dimension_values (organization_id, dimension_id, name, position)
select x.organization_id, dim.id, x.name, coalesce(x.position, 0)
from service_contexts x
join dimensions dim on dim.organization_id = x.organization_id and dim.name = 'Context' and dim.service_domain_id is null
on conflict do nothing;

insert into dimension_values (organization_id, dimension_id, name, position)
select x.organization_id, dim.id, x.name, coalesce(x.position, 0)
from purposes x
join dimensions dim on dim.organization_id = x.organization_id and dim.name = 'Purpose' and dim.service_domain_id is null
on conflict do nothing;

insert into dimension_values (organization_id, dimension_id, name, position)
select x.organization_id, dim.id, x.name, coalesce(x.position, 0)
from client_types x
join dimensions dim on dim.organization_id = x.organization_id and dim.name = 'Client' and dim.service_domain_id is null
on conflict do nothing;

-- What each service is tagged as. These were never columns: a service tags
-- through service_schema_* junctions and can carry several values per
-- dimension, which is the shape the generic table keeps.
insert into service_dimension_values (organization_id, service_id, dimension_value_id)
select j.organization_id, j.service_id, dv.id
from service_schema_subjects j
join subjects f on f.id = j.subject_id
join dimensions dim on dim.organization_id = j.organization_id and dim.name = 'Subject' and dim.service_domain_id is null
join dimension_values dv on dv.dimension_id = dim.id and lower(dv.name) = lower(f.name)
on conflict do nothing;

insert into service_dimension_values (organization_id, service_id, dimension_value_id)
select j.organization_id, j.service_id, dv.id
from service_schema_occasions j
join occasions f on f.id = j.occasion_id
join dimensions dim on dim.organization_id = j.organization_id and dim.name = 'Occasion' and dim.service_domain_id is null
join dimension_values dv on dv.dimension_id = dim.id and lower(dv.name) = lower(f.name)
on conflict do nothing;

insert into service_dimension_values (organization_id, service_id, dimension_value_id)
select j.organization_id, j.service_id, dv.id
from service_schema_contexts j
join service_contexts f on f.id = j.context_id
join dimensions dim on dim.organization_id = j.organization_id and dim.name = 'Context' and dim.service_domain_id is null
join dimension_values dv on dv.dimension_id = dim.id and lower(dv.name) = lower(f.name)
on conflict do nothing;

insert into service_dimension_values (organization_id, service_id, dimension_value_id)
select j.organization_id, j.service_id, dv.id
from service_schema_purposes j
join purposes f on f.id = j.purpose_id
join dimensions dim on dim.organization_id = j.organization_id and dim.name = 'Purpose' and dim.service_domain_id is null
join dimension_values dv on dv.dimension_id = dim.id and lower(dv.name) = lower(f.name)
on conflict do nothing;

insert into service_dimension_values (organization_id, service_id, dimension_value_id)
select j.organization_id, j.service_id, dv.id
from service_schema_client_types j
join client_types f on f.id = j.client_type_id
join dimensions dim on dim.organization_id = j.organization_id and dim.name = 'Client' and dim.service_domain_id is null
join dimension_values dv on dv.dimension_id = dim.id and lower(dv.name) = lower(f.name)
on conflict do nothing;

-- And what each package selects, from its five junctions.
insert into package_dimension_values (organization_id, package_id, dimension_value_id)
select p.organization_id, p.package_id, dv.id
from package_subjects p
join subjects f on f.id = p.subject_id
join dimensions dim on dim.organization_id = p.organization_id and dim.name = 'Subject' and dim.service_domain_id is null
join dimension_values dv on dv.dimension_id = dim.id and lower(dv.name) = lower(f.name)
on conflict do nothing;

insert into package_dimension_values (organization_id, package_id, dimension_value_id)
select p.organization_id, p.package_id, dv.id
from package_occasions p
join occasions f on f.id = p.occasion_id
join dimensions dim on dim.organization_id = p.organization_id and dim.name = 'Occasion' and dim.service_domain_id is null
join dimension_values dv on dv.dimension_id = dim.id and lower(dv.name) = lower(f.name)
on conflict do nothing;

insert into package_dimension_values (organization_id, package_id, dimension_value_id)
select p.organization_id, p.package_id, dv.id
from package_contexts p
join service_contexts f on f.id = p.context_id
join dimensions dim on dim.organization_id = p.organization_id and dim.name = 'Context' and dim.service_domain_id is null
join dimension_values dv on dv.dimension_id = dim.id and lower(dv.name) = lower(f.name)
on conflict do nothing;

insert into package_dimension_values (organization_id, package_id, dimension_value_id)
select p.organization_id, p.package_id, dv.id
from package_purposes p
join purposes f on f.id = p.purpose_id
join dimensions dim on dim.organization_id = p.organization_id and dim.name = 'Purpose' and dim.service_domain_id is null
join dimension_values dv on dv.dimension_id = dim.id and lower(dv.name) = lower(f.name)
on conflict do nothing;

insert into package_dimension_values (organization_id, package_id, dimension_value_id)
select p.organization_id, p.package_id, dv.id
from package_client_types p
join client_types f on f.id = p.client_type_id
join dimensions dim on dim.organization_id = p.organization_id and dim.name = 'Client' and dim.service_domain_id is null
join dimension_values dv on dv.dimension_id = dim.id and lower(dv.name) = lower(f.name)
on conflict do nothing;

-- enabled_dimensions carried the studio's on/off choices for the fixed five;
-- that now lives on the dimension itself, so a studio can switch off one it
-- added just as easily as one that shipped.
update dimensions d
set is_active = false
from organizations o
where d.organization_id = o.id
  and o.enabled_dimensions is not null
  and array_length(o.enabled_dimensions, 1) is not null
  and lower(d.name) <> all (select lower(x) from unnest(o.enabled_dimensions) as x);

alter table dimensions enable row level security;
alter table dimension_values enable row level security;
alter table service_dimension_values enable row level security;
alter table package_dimension_values enable row level security;

create policy "Tenant Isolation" on dimensions
    for select using (organization_id in (select auth_org_ids()));
create policy "Tenant Isolation" on dimension_values
    for select using (organization_id in (select auth_org_ids()));
create policy "Tenant Isolation" on service_dimension_values
    for select using (organization_id in (select auth_org_ids()));
create policy "Tenant Isolation" on package_dimension_values
    for select using (organization_id in (select auth_org_ids()));
