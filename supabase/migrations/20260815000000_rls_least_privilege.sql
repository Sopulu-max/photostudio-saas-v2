-- RLS hardening, from an audit of all 53 tables, 57 policies and 4 buckets.
--
-- Three findings, in descending severity.
--
-- ---------------------------------------------------------------------------
-- 1. The `assets` storage bucket was readable and DELETABLE across tenants.
-- ---------------------------------------------------------------------------
-- Three policies gated on nothing but the bucket name:
--
--   SELECT "Authenticated users can view assets"    -> bucket_id = 'assets'
--   DELETE "Authenticated users can delete their assets" -> bucket_id = 'assets'
--   INSERT "Authenticated users can upload assets"  -> bucket_id = 'assets'
--
-- The DELETE policy says "their assets" and checks no ownership whatsoever:
-- any authenticated user of any studio could have deleted every object in it.
-- Its siblings show what was intended — the `deliveries` and `avatars` buckets
-- both scope by first path segment, `(storage.foldername(name))[1] = org id`.
--
-- The bucket is empty and no code references it (uploads go to 'deliveries'
-- and 'avatars'; `.from('assets')` in the modules is the assets *table*). So
-- this was never exploited, and the fix is to remove the grant rather than
-- rewrite it. With no policies the bucket fails closed, which is the right
-- default for one nothing uses — anyone adopting it later has to say what
-- scoping it deserves instead of inheriting "everyone".
drop policy if exists "Authenticated users can view assets"         on storage.objects;
drop policy if exists "Authenticated users can delete their assets" on storage.objects;
drop policy if exists "Authenticated users can upload assets"       on storage.objects;

-- ---------------------------------------------------------------------------
-- 2. delivery_deliverables had RLS enabled and no policy at all.
-- ---------------------------------------------------------------------------
-- My omission when the table was added. It fails closed today because every
-- server path uses the service role, which bypasses RLS — but a table whose
-- protection is "nobody remembered to grant anything" is protected by accident.
-- Given the same isolation as every sibling, explicitly.
drop policy if exists "Tenant Isolation" on delivery_deliverables;
create policy "Tenant Isolation" on delivery_deliverables
    for select using (organization_id in (select auth_org_ids()));

-- ---------------------------------------------------------------------------
-- 3. 39 tables granted the browser full write access to its own org's rows.
-- ---------------------------------------------------------------------------
-- Every "Tenant Isolation" policy was `for all`, so a logged-in operator's
-- session token could INSERT, UPDATE and DELETE directly against the API,
-- bypassing the domain layer entirely. This is not a cross-tenant hole — the
-- org scoping holds, and on an ALL policy Postgres reuses the USING expression
-- as the insert check — but it is a hole in the thing this system claims is
-- non-negotiable: organizational memory. Every write in the application logs
-- an event. A write that goes around the application logs nothing, so an
-- invoice could be settled or a price changed with no trace in the log the
-- studio is supposed to be able to trust.
--
-- Nothing needs the grant. Audited: the only three components that touch the
-- browser Supabase client do storage uploads (DeliveryForms, AvatarUpload) or
-- a realtime subscription (NotificationBell). There is not one table write
-- from the browser anywhere in src/. Every mutation is a server action on the
-- service role, which is unaffected by RLS.
--
-- So the browser keeps exactly what it demonstrably needs — reads, which is
-- also what realtime subscriptions require — and loses what nothing uses.
--
-- IMPACT: after this, any client-side write will fail. That is intended: it
-- makes the domain layer the only door, matching the module seam discipline
-- already enforced in application code. If a future feature needs a direct
-- write, it should get its own narrow policy naming the table and the reason.
do $$
declare r record;
begin
    -- ALL -> SELECT, preserving each policy's own name and condition.
    for r in
        select tablename, policyname, qual
        from pg_policies
        where schemaname = 'public' and cmd = 'ALL' and qual like '%auth_org_ids%'
    loop
        execute format('drop policy %I on public.%I', r.policyname, r.tablename);
        execute format('create policy %I on public.%I for select using (%s)',
                       r.policyname, r.tablename, r.qual);
    end loop;

    -- Drop standalone write policies, but never the last policy on a table:
    -- a table left with none denies reads too, which would be a new bug.
    for r in
        select p.tablename, p.policyname
        from pg_policies p
        where p.schemaname = 'public'
          and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
          and exists (
              select 1 from pg_policies s
              where s.schemaname = 'public' and s.tablename = p.tablename and s.cmd = 'SELECT'
          )
    loop
        execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    end loop;
end $$;
