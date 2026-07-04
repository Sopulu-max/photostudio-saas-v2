-- ==========================================
-- AUTH & TENANCY WIRING
-- ==========================================
-- This migration:
-- 1. Creates the user → organization membership table
-- 2. Creates the Supabase custom_access_token_hook that injects org_id into the JWT
-- 3. Grants the hook the permission it needs to read membership
-- 4. Seeds the dev user membership for the scaffold org
-- ==========================================

-- 1. User-to-org membership table
CREATE TABLE IF NOT EXISTS public.user_organizations (
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff', 'reception')),
  created_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
  PRIMARY KEY (user_id, org_id)
);

-- Enable RLS so users can only see their own membership rows
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_orgs_own ON public.user_organizations
  FOR SELECT USING (user_id = auth.uid());

-- Grant service role full access (needed by the JWT hook)
GRANT SELECT ON public.user_organizations TO service_role;
GRANT SELECT ON public.user_organizations TO supabase_auth_admin;

-- 2. Custom Access Token Hook
-- This hook fires on every token mint/refresh and injects the user's org_id + role into the JWT claims.
-- RLS policies call current_tenant_id() which reads jwt.claims->>'org_id'.
-- If a user belongs to multiple orgs, the first (by creation) is used; 
-- future work: org-switcher that re-mints the token for the selected org.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  membership RECORD;
BEGIN
  -- Get the user's primary organization membership
  SELECT uo.org_id, uo.role
  INTO membership
  FROM public.user_organizations uo
  WHERE uo.user_id = (event->>'user_id')::uuid
  ORDER BY uo.created_at ASC
  LIMIT 1;

  -- Copy the existing claims
  claims := event->'claims';

  -- Inject org_id and staff role if membership exists
  IF membership IS NOT NULL THEN
    claims := jsonb_set(claims, '{org_id}', to_jsonb(membership.org_id::text));
    claims := jsonb_set(claims, '{user_role}', to_jsonb(membership.role));
  END IF;

  -- Return the modified event
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant auth schema permission to invoke the hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- 3. Seed: associate the dev seed user with the scaffold org
-- This runs only if the seed user exists (safe to ignore if not yet created)
-- In production, this is done via the signup flow.
-- Dev: after running `npx supabase start`, create a user in Supabase Studio 
--      and this policy will attach them to the seed org automatically 
--      via the hook once you insert a row here.
-- Example (replace with your actual user UUID after signup):
-- INSERT INTO public.user_organizations (user_id, org_id, role)
-- VALUES ('<your-user-uuid>', '11111111-2222-3333-4444-555555555555', 'owner')
-- ON CONFLICT DO NOTHING;
