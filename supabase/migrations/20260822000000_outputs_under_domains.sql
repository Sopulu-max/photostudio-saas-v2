-- Output types and blueprints join the dimensions under a domain, and the old
-- five-of-everything goes.
--
-- Naming, since the schema has been arguing with itself about this. There are
-- three things and two words:
--
--   output type   the KIND a service can produce — "Edited photographs".
--                 Generic. No quantity. Belongs to a domain: Photography
--                 produces edited photographs, Printing produces framed prints.
--
--   deliverable   an output type PROMISED and SPECIFIED — "6 edited
--                 photographs", "one 20x30 framed print". Cannot exist outside
--                 a package, because a quantity only means something once
--                 something is being sold. That is package_deliverables, which
--                 gained quantity/unit/spec.
--
--   asset         the actual FILE. An instance of an output type, produced by
--                 a task, handed over in a delivery container.
--
-- type -> promise -> instance. The table named `deliverables` holds the first
-- of those, which is why it was once renamed to output_types and reverted
-- halfway. The rename belongs with the module rewrite, not here; this migration
-- fixes the scope, which is what actually blocks a studio.

-- ── Output types belong to a domain ─────────────────────────────────────────
alter table deliverables
    add column if not exists service_domain_id uuid references service_domains(id) on delete cascade;

-- Each existing output type becomes that output type *in each domain*, the same
-- way dimension values did. Two rows sharing a name are different facts.
insert into deliverables (organization_id, name, service_domain_id)
select d.organization_id, d.name, sd.id
from deliverables d
join service_domains sd on sd.organization_id = d.organization_id
where d.service_domain_id is null
on conflict do nothing;

-- Re-point everything that referenced the unscoped row to the one under the
-- right domain. A service knows its domain; that is the whole basis here.
update services s
set primary_deliverable_id = target.id
from deliverables old_d, deliverables target
where s.primary_deliverable_id = old_d.id
  and old_d.service_domain_id is null
  and target.organization_id = s.organization_id
  and target.service_domain_id = s.service_domain_id
  and lower(target.name) = lower(old_d.name);

insert into service_deliverables (organization_id, service_id, deliverable_id)
select sd.organization_id, sd.service_id, target.id
from service_deliverables sd
join deliverables old_d on old_d.id = sd.deliverable_id and old_d.service_domain_id is null
join services s on s.id = sd.service_id
join deliverables target on target.organization_id = sd.organization_id
                        and target.service_domain_id = s.service_domain_id
                        and lower(target.name) = lower(old_d.name)
on conflict do nothing;

-- A package can bundle across domains, so it keeps the promise under each.
insert into package_deliverables (organization_id, package_id, deliverable_id, quantity, unit, spec)
select distinct pd.organization_id, pd.package_id, target.id, pd.quantity, pd.unit, pd.spec
from package_deliverables pd
join deliverables old_d on old_d.id = pd.deliverable_id and old_d.service_domain_id is null
join package_services ps on ps.package_id = pd.package_id
join services s on s.id = ps.service_id
join deliverables target on target.organization_id = pd.organization_id
                        and target.service_domain_id = s.service_domain_id
                        and lower(target.name) = lower(old_d.name)
on conflict do nothing;

update assets a
set deliverable_id = target.id
from deliverables old_d, deliverables target
where a.deliverable_id = old_d.id
  and old_d.service_domain_id is null
  and target.organization_id = a.organization_id
  and lower(target.name) = lower(old_d.name)
  and target.service_domain_id is not null;

-- The unscoped originals have nothing left pointing at them.
delete from deliverables where service_domain_id is null;
alter table deliverables alter column service_domain_id set not null;
create unique index if not exists deliverables_unique_per_domain
    on deliverables(service_domain_id, lower(name));

-- ── Blueprints belong to a domain ───────────────────────────────────────────
-- A process for retouching photographs is not a process a printing studio has
-- any use for. Nullable: a studio may have written one before it had domains,
-- and losing its process is worse than an unscoped row it can file later.
alter table blueprints
    add column if not exists service_domain_id uuid references service_domains(id) on delete set null;

update blueprints b
set service_domain_id = (
    select s.service_domain_id from services s
    where s.organization_id = b.organization_id and s.service_domain_id is not null
    limit 1
)
where b.service_domain_id is null;

-- ── The five-of-everything goes ─────────────────────────────────────────────
-- Migrated into dimensions/dimension_values and verified row for row. Keeping
-- them would leave two answers to the same question, which is the thing this
-- whole rework exists to stop.
drop table if exists service_schema_subjects;
drop table if exists service_schema_occasions;
drop table if exists service_schema_contexts;
drop table if exists service_schema_purposes;
drop table if exists service_schema_client_types;

drop table if exists package_subjects;
drop table if exists package_occasions;
drop table if exists package_contexts;
drop table if exists package_purposes;
drop table if exists package_client_types;

drop table if exists subjects;
drop table if exists occasions;
drop table if exists service_contexts;
drop table if exists purposes;
drop table if exists client_types;

-- Which dimensions are on now lives on the dimension itself, per domain.
alter table organizations drop column if exists enabled_dimensions;
