-- Add price column to packages
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='packages' AND column_name='price') THEN
    ALTER TABLE packages ADD COLUMN price jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;
