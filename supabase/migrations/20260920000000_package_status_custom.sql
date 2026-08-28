-- Allow 'custom' status on packages so private clones don't pollute the catalog
-- If there is an existing constraint, drop it and recreate it.
DO $$ 
DECLARE
  con_name text;
BEGIN
  -- Find the check constraint on the status column
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = t.oid
  WHERE n.nspname = 'public' 
    AND t.relname = 'packages' 
    AND a.attname = 'status'
    AND c.contype = 'c'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE packages DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE packages ADD CONSTRAINT packages_status_check CHECK (status IN ('active', 'retired', 'custom'));
