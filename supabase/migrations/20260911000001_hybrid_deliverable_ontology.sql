-- Hybrid Deliverable Ontology Migration
-- Deliverables can act as a Class (defining spec_schema) or an Instance (defining spec_values).
-- Packages can define spec_values if the Deliverable acts only as a Class.

alter table deliverables
    add column if not exists spec_schema jsonb,
    add column if not exists spec_values jsonb;

comment on column deliverables.spec_values is
    'Static values answering the spec_schema, used when the deliverable acts as a predefined SKU.';

alter table package_deliverables
    add column if not exists spec_values jsonb;

comment on column package_deliverables.spec_values is
    'Dynamic values answering the deliverable''s spec_schema, used when the deliverable is a class and the package provides the instance.';
