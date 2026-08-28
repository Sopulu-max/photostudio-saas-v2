-- Custom packages created during booking were previously marked as 'active' and named '... (Copy)'.
-- This updates their status to 'custom' so they no longer pollute the active catalog.
UPDATE packages 
SET status = 'custom' 
WHERE name LIKE '%(Copy)' AND status = 'active';
