-- The five flat vocabularies go, for real this time.
--
-- `subjects` / `occasions` / `service_contexts` / `purposes` / `client_types`
-- were studio-wide lists with one closed set of five questions above them.
-- `dimensions` + `dimension_values`, owned by a service domain, replaced them
-- in 20260821000000. 20260822000000 dropped the old shape while ~60 places in
-- src/ still queried it, and a scaffolding migration put it back so the app
-- would run while the module layer moved.
--
-- The module layer moved in the same commit as this file, and the scaffolding
-- is deleted with it — so on a fresh database these tables never exist and
-- everything below is a no-op. On the live database they do, and this removes
-- them. `organizations.enabled_dimensions` goes too: it asked "which of the
-- five do you organize by", a question `dimensions.is_active` now answers per
-- domain, and two records of one fact drift.
--
-- Guarded, because a silent drop is how the last one destroyed data: this
-- refuses to run if any old junction row is not already represented in the new
-- tables. Everything is dynamic SQL so a missing table is skipped rather than
-- being a parse error.

do $$
declare
    stranded integer;
    old_junction text;
    old_value_table text;
    old_column text;
    pairs text[][] := array[
        ['service_schema_subjects',     'subjects',         'subject_id'],
        ['service_schema_occasions',    'occasions',        'occasion_id'],
        ['service_schema_contexts',     'service_contexts', 'context_id'],
        ['service_schema_purposes',     'purposes',         'purpose_id'],
        ['service_schema_client_types', 'client_types',     'client_type_id']
    ];
    package_pairs text[][] := array[
        ['package_subjects',     'subjects',         'subject_id'],
        ['package_occasions',    'occasions',        'occasion_id'],
        ['package_contexts',     'service_contexts', 'context_id'],
        ['package_purposes',     'purposes',         'purpose_id'],
        ['package_client_types', 'client_types',     'client_type_id']
    ];
    i integer;
begin
    -- Anything a service was tagged with that the new links don't already hold.
    for i in 1 .. array_length(pairs, 1) loop
        old_junction := pairs[i][1];
        old_value_table := pairs[i][2];
        old_column := pairs[i][3];
        continue when to_regclass('public.' || old_junction) is null
                   or to_regclass('public.' || old_value_table) is null;

        execute format($q$
            select count(*) from %I j join %I f on f.id = j.%I
            where not exists (
                select 1 from service_dimension_values sdv
                join dimension_values v on v.id = sdv.dimension_value_id
                where sdv.service_id = j.service_id and lower(v.name) = lower(f.name)
            )
        $q$, old_junction, old_value_table, old_column) into stranded;

        if stranded > 0 then
            raise exception 'Refusing to drop: % service tag(s) exist only in %', stranded, old_junction;
        end if;
    end loop;

    -- The same question for packages. These junctions were rebuilt empty by the
    -- scaffolding migration, so anything in them was written after that — by
    -- code that has since moved.
    for i in 1 .. array_length(package_pairs, 1) loop
        old_junction := package_pairs[i][1];
        old_value_table := package_pairs[i][2];
        old_column := package_pairs[i][3];
        continue when to_regclass('public.' || old_junction) is null
                   or to_regclass('public.' || old_value_table) is null;

        execute format($q$
            select count(*) from %I j join %I f on f.id = j.%I
            where not exists (
                select 1 from package_dimension_values pdv
                join dimension_values v on v.id = pdv.dimension_value_id
                where pdv.package_id = j.package_id and lower(v.name) = lower(f.name)
            )
        $q$, old_junction, old_value_table, old_column) into stranded;

        if stranded > 0 then
            raise exception 'Refusing to drop: % package tag(s) exist only in %', stranded, old_junction;
        end if;
    end loop;
end $$;

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

alter table organizations drop column if exists enabled_dimensions;
