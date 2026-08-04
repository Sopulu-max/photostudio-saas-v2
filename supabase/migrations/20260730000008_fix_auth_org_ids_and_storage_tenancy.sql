-- auth_org_ids() still queried the 'persons' table, dropped when the kernel
-- moved to 'contacts'. Every table's RLS tenant-isolation policy calls this
-- function — it's been silently broken (errors when actually evaluated
-- under RLS) since persons was dropped, masked only because almost every
-- read/write in this app goes through the service-role client, which
-- bypasses RLS entirely. This is the actual backstop; it had a hole in it.

CREATE OR REPLACE FUNCTION auth_org_ids()
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM contacts WHERE auth_user_id = auth.uid();
$$ LANGUAGE sql STABLE;

-- Storage RLS gap: every bucket's policy only checked bucket_id, never the
-- path. An authenticated user from ANY org could read/write/delete ANY
-- other org's files by calling the Storage API directly with a guessed or
-- enumerated path — completely bypassing the app-level org scoping used
-- everywhere else. Worst for 'deliveries' (private client galleries meant
-- to be signed-URL-only) but real for all three buckets.
--
-- Fix: scope insert/update/delete to the org folder the uploader actually
-- belongs to. Paths are '{orgId}/...' by convention (see getUploadTarget /
-- getAvatarUploadTarget) — the first path segment must parse as an org id
-- the caller has access to. Avatars keep public SELECT (deliberately
-- low-sensitivity, rendered inline across many rows); deliveries' SELECT is
-- tightened to org members only — public viewing goes through the signed
-- gallery URL, never direct bucket access.

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;

CREATE POLICY "Org-scoped avatar uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1]::uuid IN (SELECT auth_org_ids()));

CREATE POLICY "Org-scoped avatar updates"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1]::uuid IN (SELECT auth_org_ids()));

CREATE POLICY "Org-scoped avatar deletes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1]::uuid IN (SELECT auth_org_ids()));
-- "Anyone can view avatars" (public SELECT) is unchanged — deliberate.

DROP POLICY IF EXISTS "Authenticated users can upload deliveries" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view deliveries" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete deliveries" ON storage.objects;

CREATE POLICY "Org-scoped delivery uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'deliveries' AND (storage.foldername(name))[1]::uuid IN (SELECT auth_org_ids()));

CREATE POLICY "Org-scoped delivery reads"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'deliveries' AND (storage.foldername(name))[1]::uuid IN (SELECT auth_org_ids()));

CREATE POLICY "Org-scoped delivery deletes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'deliveries' AND (storage.foldername(name))[1]::uuid IN (SELECT auth_org_ids()));
