-- Migration: Create 'studio_assets' bucket and associated RLS policies
-- Description: Sets up the storage infrastructure for Milestone 4 (Asset & Outcome Flows)

-- 1. Create the bucket (private by default)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('studio_assets', 'studio_assets', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on storage.objects (usually enabled by default in Supabase, but good to be explicit)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Allow authenticated users to INSERT files to their organization's folder
-- The folder structure is: studio_assets/[organization_id]/...
CREATE POLICY "Allow studio users to upload to their org folder" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'studio_assets' AND
  (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::text
);

-- 4. Policy: Allow authenticated users to SELECT files from their organization's folder
CREATE POLICY "Allow studio users to read from their org folder" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'studio_assets' AND
  (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::text
);

-- 5. Policy: Allow authenticated users to UPDATE files in their organization's folder
CREATE POLICY "Allow studio users to update their org folder" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'studio_assets' AND
  (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::text
);

-- 6. Policy: Allow authenticated users to DELETE files in their organization's folder
CREATE POLICY "Allow studio users to delete from their org folder" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'studio_assets' AND
  (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::text
);
