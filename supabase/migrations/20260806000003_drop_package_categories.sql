-- Packages are no longer grouped by a bespoke 'service_categories' table.
-- They are grouped by the 5 native dimensions (Subject, Occasion, Context, Purpose, Client)
-- which were added in 20260806000001_package_dimensions.sql.
-- This migration removes the legacy classification system to enforce the new ontology.

alter table packages drop column category_id;
drop table service_categories;
