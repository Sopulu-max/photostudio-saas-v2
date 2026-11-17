-- Let the API see the `weave` schema.
--
-- Creating a schema is not enough. Supabase's REST layer serves only the
-- schemas it has been told to expose — `public` and `graphql_public` by
-- default — so every query against `weave` came back "Invalid schema: weave",
-- including the ones the application makes. The tables existed and were
-- unreachable.
--
-- Two separate things are needed and missing either one looks the same from
-- outside: the schema has to be LISTED for PostgREST, and the API roles have to
-- be GRANTED access to it.

grant usage on schema weave to anon, authenticated, service_role;

grant all on all tables in schema weave to anon, authenticated, service_role;
grant all on all sequences in schema weave to anon, authenticated, service_role;
grant all on all functions in schema weave to anon, authenticated, service_role;

-- Tables added later get the same treatment without a second migration.
alter default privileges in schema weave
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema weave
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema weave
  grant all on functions to anon, authenticated, service_role;

-- Row-level security is on and no policy grants anything, so `anon` and
-- `authenticated` can still read nothing directly; the application reaches
-- these tables with the service role and scopes every query by studio_id
-- itself. The grants above are what makes the schema addressable at all.

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, weave';

-- TWO signals, not one. 'reload config' makes PostgREST notice the schema is
-- listed; the table list lives in a separate cache and stays stale without
-- 'reload schema'. With only the first, the error moves from "Invalid schema"
-- to "Could not find the table in the schema cache", which looks like a missing
-- table and is not one.
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
