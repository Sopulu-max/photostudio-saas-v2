-- Revert 'output_types' back to 'deliverables'
ALTER TABLE output_types RENAME TO deliverables;

-- Revert foreign keys in services table
ALTER TABLE services RENAME COLUMN required_input_type_id TO required_input_deliverable_id;
ALTER TABLE services RENAME COLUMN primary_output_type_id TO primary_deliverable_id;

-- Revert 'service_outputs' back to 'service_deliverables'
ALTER TABLE service_outputs RENAME TO service_deliverables;
ALTER TABLE service_deliverables RENAME COLUMN output_type_id TO deliverable_id;

-- Revert 'package_outputs' back to 'package_deliverables'
ALTER TABLE package_outputs RENAME TO package_deliverables;
ALTER TABLE package_deliverables RENAME COLUMN output_type_id TO deliverable_id;

-- Revert 'assets' (previously production_assets conceptually)
ALTER TABLE assets RENAME COLUMN output_type_id TO deliverable_id;
