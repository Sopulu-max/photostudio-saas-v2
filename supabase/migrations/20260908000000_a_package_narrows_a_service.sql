-- A package narrows the services it bundles. It does not tag itself.
--
-- `package_dimension_values` was keyed (package_id, dimension_value_id), which
-- says "this package is a Wedding" as a free-standing fact. That was a
-- mechanical port of the five flat columns packages used to carry — see
-- 20260821000000, "One link table each, replacing five columns and five
-- junctions" — and not something the ontology ever asked for.
--
-- The flat key cannot express what a package actually does. A service offers
-- Wedding, Birthday and Corporate; "Gold Wedding" sells the Wedding case of it.
-- That is a narrowing OF A BUNDLED SERVICE, and with only a package_id there is
-- nowhere to say which service is being narrowed — a package bundling two
-- Photography services could not tell them apart.
--
-- It also sat beside a derivation that already said the same thing better.
-- `whatCarries` returns a package's classification two ways, `direct` from this
-- table and `bundled` derived through package_services, and only the derived one
-- knows the route. Re-keying to package_service_id makes the narrowing an edge
-- THROUGH the service, so both readings come from the same place and can no
-- longer disagree.
--
-- This supersedes the stance recorded in 20260821000001: "A package spanning two
-- domains keeps the tag under each of them." True of a tag, wrong for a
-- narrowing — the narrowing belongs to the bundled service whose vocabulary it
-- speaks, and a package spanning two domains narrows each one separately.

create table if not exists package_service_dimension_values (
    organization_id    uuid not null references organizations(id) on delete cascade,
    -- The bundled service, not the package: this is what makes it a narrowing.
    package_service_id uuid not null references package_services(id) on delete cascade,
    dimension_value_id uuid not null references dimension_values(id) on delete cascade,
    created_at         timestamptz not null default now(),
    primary key (package_service_id, dimension_value_id)
);

create index if not exists idx_psdv_org on package_service_dimension_values(organization_id);
-- The backward read — "what does this studio sell for Weddings" — enters here.
create index if not exists idx_psdv_value on package_service_dimension_values(dimension_value_id);

alter table package_service_dimension_values enable row level security;
create policy "Tenant Isolation" on package_service_dimension_values
    for all using (organization_id in (select auth_org_ids()));

-- Carry across whatever the flat table held, routing each value through a
-- bundled service that speaks its domain. A package tagged Wedding while
-- bundling a Photography service becomes that service narrowed to Wedding.
insert into package_service_dimension_values (organization_id, package_service_id, dimension_value_id)
select distinct pdv.organization_id, ps.id, pdv.dimension_value_id
from package_dimension_values pdv
join package_services ps on ps.package_id = pdv.package_id
join services s on s.id = ps.service_id
join dimension_values dv on dv.id = pdv.dimension_value_id
join dimensions d on d.id = dv.dimension_id
                 and d.service_domain_id = s.service_domain_id
on conflict do nothing;

-- Refuse to drop anything that did not survive the routing above. A value whose
-- domain no bundled service speaks has no service to narrow, and silently
-- losing it is exactly the failure this repo has already been bitten by.
do $$
declare orphaned bigint;
begin
    select count(*) into orphaned
    from package_dimension_values pdv
    where not exists (
        select 1
        from package_service_dimension_values psdv
        join package_services ps on ps.id = psdv.package_service_id
        where ps.package_id = pdv.package_id
          and psdv.dimension_value_id = pdv.dimension_value_id
    );
    if orphaned > 0 then
        raise exception
            '% package classification(s) point at a domain no bundled service speaks. Attach a service in that domain, or clear the value, then re-run.',
            orphaned;
    end if;
end $$;

drop table package_dimension_values;

comment on table package_service_dimension_values is
    'How a package narrows one of the services it bundles: the Wedding case of a Photography service that also does Birthdays. Keyed on package_service_id so the narrowing names the service it applies to.';
