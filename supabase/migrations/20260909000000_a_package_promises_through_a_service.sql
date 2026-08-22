-- A package promises through the services it bundles.
--
-- Same ruling as 20260908000000, applied to the three links that were left flat:
-- what a package fixes, what it promises, and how it is produced are all facts
-- about a service *inside this package*, not about the package. Keyed to
-- package_id, none of them can answer "which one" — bundle Event Photography
-- twice for a two-day wedding and there is one row where there should be two.
--
-- package_delivery_containers is deliberately NOT here. A container transports
-- an output; it is not a property of a service, and keying it to one would be a
-- mechanical port rather than a decision.

-- ── What a package fixes ─────────────────────────────────────────────────────

alter table package_variable_values
  add column if not exists package_service_id uuid references package_services(id) on delete cascade;

-- A variable belongs to exactly one service, so the bundle row it belongs to is
-- not a guess: it is the row bundling that variable's own service.
update package_variable_values pvv
   set package_service_id = ps.id
  from package_services ps
  join service_variables sv on sv.service_id = ps.service_id
 where ps.package_id = pvv.package_id
   and sv.id = pvv.service_variable_id
   and pvv.package_service_id is null;

-- ── What a package promises ──────────────────────────────────────────────────

alter table package_deliverables
  add column if not exists package_service_id uuid references package_services(id) on delete cascade;

-- Prefer the bundled service that actually declares this output. Falling back to
-- the first bundled service keeps a promise the studio already made rather than
-- dropping it — a package with no bundle at all has nothing to carry to and is
-- caught by the guard below.
update package_deliverables pd
   set package_service_id = (
     select ps.id
       from package_services ps
       left join service_deliverables sd
         on sd.service_id = ps.service_id
        and sd.deliverable_id = pd.deliverable_id
      where ps.package_id = pd.package_id
      order by (sd.id is null), ps.position
      limit 1
   )
 where pd.package_service_id is null;

-- ── How a package is produced ────────────────────────────────────────────────

alter table package_workflows
  add column if not exists package_service_id uuid references package_services(id) on delete cascade;

update package_workflows pw
   set package_service_id = (
     select ps.id from package_services ps
      where ps.package_id = pw.package_id
      order by ps.position limit 1
   )
 where pw.package_service_id is null;

-- ── Nothing may be lost ──────────────────────────────────────────────────────

do $$
declare orphaned int;
begin
  select (select count(*) from package_variable_values where package_service_id is null)
       + (select count(*) from package_deliverables    where package_service_id is null)
       + (select count(*) from package_workflows       where package_service_id is null)
    into orphaned;
  if orphaned > 0 then
    raise exception 'Refusing to re-key: % row(s) could not be matched to a bundled service', orphaned;
  end if;
end $$;

-- ── The flat key goes ────────────────────────────────────────────────────────

alter table package_variable_values
  drop constraint package_variable_values_pkey,
  alter column package_service_id set not null,
  drop column package_id,
  add primary key (package_service_id, service_variable_id);

alter table package_deliverables
  drop constraint package_deliverables_package_id_deliverable_id_key,
  alter column package_service_id set not null,
  drop column package_id,
  add constraint package_deliverables_package_service_id_deliverable_id_key
    unique (package_service_id, deliverable_id);

alter table package_workflows
  drop constraint package_workflows_pkey,
  alter column package_service_id set not null,
  drop column package_id,
  add primary key (package_service_id, blueprint_id);

create index if not exists idx_package_variable_values_bundle on package_variable_values(package_service_id);
create index if not exists idx_package_deliverables_bundle on package_deliverables(package_service_id);
create index if not exists idx_package_workflows_bundle on package_workflows(package_service_id);
