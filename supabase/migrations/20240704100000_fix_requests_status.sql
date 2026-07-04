-- ==========================================
-- CONSTITUTIONAL ROUND 3 — N3 REQUESTS PATCH
-- ==========================================
-- The previous migration used the wrong vocabulary for requests.
-- Canonical union from the Kernel Specification:
--   created → reviewed → accepted → declined | withdrawn | expired

-- 1. Drop the bad constraint
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_status_check;

-- 2. Restore the correct column default (was regressed by the previous migration)
ALTER TABLE public.requests ALTER COLUMN status SET DEFAULT 'created';

-- 3. Apply the correct constraint
ALTER TABLE public.requests ADD CONSTRAINT requests_status_check 
  CHECK (status IN ('created', 'reviewed', 'accepted', 'declined', 'withdrawn', 'expired'));

-- 4. Fix the trigger's request branch vocabulary to match
CREATE OR REPLACE FUNCTION public.update_entity_status_from_event()
RETURNS trigger AS $$
DECLARE
    new_status text;
BEGIN
    -- Extract the status from event_type (e.g. "agreement.active" -> "active")
    new_status := split_part(new.event_type, '.', 2);
    
    -- Validate and apply based on canonical unions, strictly enforcing tenancy scoping (N2)
    IF new.entity_type = 'agreement' AND new_status IN ('proposed', 'active', 'completed', 'cancelled') THEN
        -- agreement.modified is an event-only concept; 'modified' is intentionally absent from the union above.
        UPDATE public.agreements 
        SET status = new_status 
        WHERE id = new.entity_id AND organization_id = new.organization_id;
        
    ELSIF new.entity_type = 'request' AND new_status IN ('created', 'reviewed', 'accepted', 'declined', 'withdrawn', 'expired') THEN
        UPDATE public.requests 
        SET status = new_status 
        WHERE id = new.entity_id AND organization_id = new.organization_id;
        
    ELSIF new.entity_type = 'service_instance' AND new_status IN ('created', 'scheduled', 'in_progress', 'waiting', 'completed', 'delivered', 'archived', 'halted') THEN
        UPDATE public.service_instances 
        SET status = new_status 
        WHERE id = new.entity_id AND organization_id = new.organization_id;
        
    ELSIF new.entity_type = 'asset' AND new_status IN ('registered', 'available', 'in_use', 'retained', 'released') THEN
        UPDATE public.assets 
        SET status = new_status 
        WHERE id = new.entity_id AND organization_id = new.organization_id;
    END IF;
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
