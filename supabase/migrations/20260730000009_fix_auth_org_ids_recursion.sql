-- auth_org_ids() reading from contacts triggers contacts' own RLS policy
-- ("organization_id in (select auth_org_ids())"), which calls auth_org_ids()
-- again — infinite recursion (Postgres error 54001, stack depth exceeded).
-- Confirmed live: swapping persons -> contacts in the prior migration
-- exposed this, masked before only because persons didn't exist and threw a
-- simpler error first.
--
-- Standard fix for a helper function used inside other tables' RLS policies:
-- SECURITY DEFINER, so its internal read of `contacts` runs as the function
-- owner and isn't itself re-subject to contacts' RLS policy. A fixed
-- search_path is set per Postgres's standard guidance for SECURITY DEFINER
-- functions, to avoid search_path hijacking.

CREATE OR REPLACE FUNCTION auth_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM contacts WHERE auth_user_id = auth.uid();
$$;
