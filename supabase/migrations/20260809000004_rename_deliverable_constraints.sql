-- Rename the foreign key constraints to match the renamed deliverables tables and columns

ALTER TABLE services RENAME CONSTRAINT services_required_input_type_id_fkey TO services_required_input_deliverable_id_fkey;
ALTER TABLE services RENAME CONSTRAINT services_primary_output_type_id_fkey TO services_primary_deliverable_id_fkey;

ALTER TABLE service_deliverables RENAME CONSTRAINT service_outputs_output_type_id_fkey TO service_deliverables_deliverable_id_fkey;
ALTER TABLE package_deliverables RENAME CONSTRAINT package_outputs_output_type_id_fkey TO package_deliverables_deliverable_id_fkey;
ALTER TABLE assets RENAME CONSTRAINT production_assets_output_type_id_fkey TO assets_deliverable_id_fkey;

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
