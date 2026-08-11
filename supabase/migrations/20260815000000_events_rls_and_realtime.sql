-- Two things, and the first is a hole.
--
-- `events` was the only table in this database with row level security
-- disabled, while `anon` and `authenticated` hold full grants on it. The anon
-- key ships in the browser bundle, so an unauthenticated request could read
-- every studio's organizational memory — verified: 127 rows across 3
-- organizations — and could equally have inserted, altered or deleted them.
--
-- The original migration did define a "Tenant Isolation" policy on events, so
-- this was not a decision anyone made; the policy was lost somewhere in the
-- rebuild, along with the auth_org_id() it referenced. Every other table kept
-- its policy under the successor function, auth_org_ids().

alter table events enable row level security;

-- SELECT only, deliberately narrower than the `for all` used elsewhere.
--
-- An audit trail is not like a booking. Every write goes through logEvent on
-- the server, which uses the service role and bypasses RLS entirely, so the
-- browser has no legitimate reason to insert, amend or delete a fact about
-- what happened. Granting only reads means organizational memory cannot be
-- rewritten by anyone holding a key that ships to the client.
drop policy if exists "Tenant Isolation" on events;
create policy "Tenant Isolation" on events
    for select
    using (organization_id in (select auth_org_ids()));

-- Belt and braces: with RLS on, an absent policy already denies writes. This
-- keeps them denied even if someone later disables RLS on this table.
revoke insert, update, delete, truncate on events from anon, authenticated;

-- Now the reason this was in the way. Realtime delivers a change only if the
-- subscriber could have selected the row, so live notifications need the
-- policy above to exist before the publication means anything.
--
-- The publication was empty, so nothing in this database was broadcasting at
-- all. Only events joins it: the notification feed is a projection of this
-- table, so it is the one place a live signal is needed.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    execute 'alter publication supabase_realtime add table events';
  end if;
end $$;
