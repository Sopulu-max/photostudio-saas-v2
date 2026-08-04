-- contacts.avatar_url and the public 'avatars' storage bucket already existed
-- (pre-provisioned, never wired to anything — same "schema exists, zero
-- surface" pattern found repeatedly this session). This migration only adds
-- what was actually missing: RLS policies on the bucket, so an authenticated
-- user can actually upload/update/delete into it.
--
-- A profile picture is identity, not CRM or employment depth — it lives on
-- the kernel contact, not duplicated on clients/employees. A contact who is
-- both a client and a team member gets one photo, not two.
--
-- Public read: avatars are low-sensitivity and rendered inline across many
-- rows (client/team lists) — signing a URL per row would be wasteful for
-- something nobody would think to keep private, unlike delivered client work.

create policy "Authenticated users can upload avatars"
on storage.objects for insert to authenticated with check (bucket_id = 'avatars');

create policy "Authenticated users can update avatars"
on storage.objects for update to authenticated using (bucket_id = 'avatars');

create policy "Authenticated users can delete avatars"
on storage.objects for delete to authenticated using (bucket_id = 'avatars');

create policy "Anyone can view avatars"
on storage.objects for select using (bucket_id = 'avatars');
