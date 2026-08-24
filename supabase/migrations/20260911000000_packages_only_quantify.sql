-- A package is not where the definition of a deliverable is written.
-- The package only states the quantity. The shape, format, and unit
-- belong to the deliverable itself. 

alter table package_deliverables
    drop column if exists unit,
    drop column if exists spec;

alter table deliverables
    add column if not exists default_unit text,
    add column if not exists spec_schema jsonb;

comment on column deliverables.default_unit is
    'The standard unit for this deliverable (e.g. seconds, pages, images).';
comment on column deliverables.spec_schema is
    'Flexible schema defining how this deliverable should be specified structurally.';
