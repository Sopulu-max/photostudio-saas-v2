-- Upgrade Booking Lines to Structural Extras
--
-- Drops the old package_extras concept. Extras are impromptu and added directly
-- to bookings. A booking line can now structurally point to a deliverable or service.

DROP TABLE IF EXISTS package_extras CASCADE;

ALTER TABLE booking_lines DROP COLUMN IF EXISTS package_extra_id;

ALTER TABLE booking_lines 
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'package'
    CHECK (target_type IN ('package', 'service', 'deliverable', 'custom')),
  ADD COLUMN IF NOT EXISTS target_deliverable_id uuid REFERENCES deliverables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_deliverable_quantity integer,
  ADD COLUMN IF NOT EXISTS target_service_id uuid REFERENCES services(id) ON DELETE SET NULL;

-- Automatically set existing lines to 'package' type if they have a package_id
UPDATE booking_lines SET target_type = 'package' WHERE package_id IS NOT NULL;

