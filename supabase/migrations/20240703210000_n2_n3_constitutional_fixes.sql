-- ==========================================
-- CONSTITUTIONAL ROUND 2 FIXES (N2, N3)
-- ==========================================

-- 1. N3: Correct the CHECK constraints on all status columns to match the canonical unions exactly.
-- Drop the auto-generated constraints (Postgres names them table_column_check by default)
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE public.agreements DROP CONSTRAINT IF EXISTS agreements_status_check;
ALTER TABLE public.service_instances DROP CONSTRAINT IF EXISTS service_instances_status_check;
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_status_check;

-- Add explicit named constraints with the corrected canonical unions
ALTER TABLE public.requests ADD CONSTRAINT requests_status_check 
  CHECK (status IN ('open', 'accepted', 'rejected', 'expired'));

ALTER TABLE public.agreements ADD CONSTRAINT agreements_status_check 
  CHECK (status IN ('proposed', 'active', 'completed', 'cancelled'));

ALTER TABLE public.service_instances ADD CONSTRAINT service_instances_status_check 
  CHECK (status IN ('created', 'scheduled', 'in_progress', 'waiting', 'completed', 'delivered', 'archived', 'halted'));

ALTER TABLE public.assets ADD CONSTRAINT assets_status_check 
  CHECK (status IN ('registered', 'available', 'in_use', 'retained', 'released'));

-- 2. N2: Fix Cross-tenant Write via Trigger (scoping) and N3: Update Trigger Vocabulary
CREATE OR REPLACE FUNCTION public.update_entity_status_from_event()
RETURNS trigger AS $$
DECLARE
    new_status text;
BEGIN
    -- Extract the status from event_type (e.g. "agreement.active" -> "active")
    new_status := split_part(new.event_type, '.', 2);
    
    -- Validate and apply based on canonical unions, strictly enforcing tenancy scoping
    IF new.entity_type = 'agreement' AND new_status IN ('proposed', 'active', 'completed', 'cancelled') THEN
        -- agreement.modified is an event, but 'modified' is not in the union above, so it will be ignored here (correct).
        UPDATE public.agreements SET status = new_status WHERE id = new.entity_id AND organization_id = new.organization_id;
        
    ELSIF new.entity_type = 'request' AND new_status IN ('open', 'accepted', 'rejected', 'expired') THEN
        UPDATE public.requests SET status = new_status WHERE id = new.entity_id AND organization_id = new.organization_id;
        
    ELSIF new.entity_type = 'service_instance' AND new_status IN ('created', 'scheduled', 'in_progress', 'waiting', 'completed', 'delivered', 'archived', 'halted') THEN
        UPDATE public.service_instances SET status = new_status WHERE id = new.entity_id AND organization_id = new.organization_id;
        
    ELSIF new.entity_type = 'asset' AND new_status IN ('registered', 'available', 'in_use', 'retained', 'released') THEN
        UPDATE public.assets SET status = new_status WHERE id = new.entity_id AND organization_id = new.organization_id;
    END IF;
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
