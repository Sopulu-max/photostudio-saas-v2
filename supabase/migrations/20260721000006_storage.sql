-- 20260721000006_storage.sql

-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('assets', 'assets', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Setup RLS for storage.objects
-- Allow users to upload and view objects in the 'assets' bucket
-- Note: A real multi-tenant policy would extract the org ID from the storage path.
-- For now, we restrict access to authenticated users.

CREATE POLICY "Authenticated users can upload assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'assets');

CREATE POLICY "Authenticated users can view assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'assets');

CREATE POLICY "Authenticated users can delete their assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'assets');
