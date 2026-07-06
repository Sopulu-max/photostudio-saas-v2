-- Migration: Regenerated State Machine
-- This migration is automatically generated from src/lib/domains/kernel/types.ts
-- DO NOT EDIT MANUALLY

-- ==========================================
-- AUTOMATICALLY GENERATED CHECK CONSTRAINTS
-- ==========================================

ALTER TABLE public.service_instances DROP CONSTRAINT IF EXISTS chk_service_instances_status;
ALTER TABLE public.service_instances ADD CONSTRAINT chk_service_instances_status CHECK (status IN ('created', 'scheduled', 'in_progress', 'waiting', 'halted', 'completed', 'delivered', 'archived'));

ALTER TABLE public.agreements DROP CONSTRAINT IF EXISTS chk_agreements_status;
ALTER TABLE public.agreements ADD CONSTRAINT chk_agreements_status CHECK (status IN ('proposed', 'active', 'completed', 'cancelled'));

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS chk_requests_status;
ALTER TABLE public.requests ADD CONSTRAINT chk_requests_status CHECK (status IN ('created', 'reviewed', 'accepted', 'declined', 'withdrawn', 'expired'));

ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS chk_assets_status;
ALTER TABLE public.assets ADD CONSTRAINT chk_assets_status CHECK (status IN ('registered', 'available', 'in_use', 'retained', 'released'));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS chk_organizations_status;
ALTER TABLE public.organizations ADD CONSTRAINT chk_organizations_status CHECK (status IN ('created', 'active', 'suspended', 'archived'));

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS chk_customers_status;
ALTER TABLE public.customers ADD CONSTRAINT chk_customers_status CHECK (status IN ('active', 'merged', 'archived'));

ALTER TABLE public.services DROP CONSTRAINT IF EXISTS chk_services_status;
ALTER TABLE public.services ADD CONSTRAINT chk_services_status CHECK (status IN ('active', 'retired'));

-- ==========================================
-- AUTOMATICALLY GENERATED TRIGGER LOGIC
-- ==========================================

CREATE OR REPLACE FUNCTION public.update_entity_status_from_event()
RETURNS TRIGGER AS $$
DECLARE
    new_status text;
BEGIN
    -- Extract the status from event_type (e.g. "agreement.active" -> "active")
    new_status := split_part(new.event_type, '.', 2);

    -- Bypass events that are purely observational and don't change status
    IF new.event_type IN ('agreement.modified', 'asset.delivered', 'identity.updated', 'identity.created', 'service.defined', 'organization.created', 'customer.registered') THEN
        RETURN new;
    END IF;

    -- Validate and apply based on canonical unions
    IF new.entity_type = 'service_instance' AND new_status IN ('created', 'scheduled', 'in_progress', 'waiting', 'halted', 'completed', 'delivered', 'archived') THEN
        UPDATE public.service_instances SET status = new_status WHERE id = new.entity_id;
    ELSIF new.entity_type = 'agreement' AND new_status IN ('proposed', 'active', 'completed', 'cancelled') THEN
        UPDATE public.agreements SET status = new_status WHERE id = new.entity_id;
    ELSIF new.entity_type = 'request' AND new_status IN ('created', 'reviewed', 'accepted', 'declined', 'withdrawn', 'expired') THEN
        UPDATE public.requests SET status = new_status WHERE id = new.entity_id;
    ELSIF new.entity_type = 'asset' AND new_status IN ('registered', 'available', 'in_use', 'retained', 'released') THEN
        UPDATE public.assets SET status = new_status WHERE id = new.entity_id;
    ELSIF new.entity_type = 'organization' AND new_status IN ('created', 'active', 'suspended', 'archived') THEN
        UPDATE public.organizations SET status = new_status WHERE id = new.entity_id;
    ELSIF new.entity_type = 'customer' AND new_status IN ('active', 'merged', 'archived') THEN
        UPDATE public.customers SET status = new_status WHERE id = new.entity_id;
    ELSIF new.entity_type = 'service' AND new_status IN ('active', 'retired') THEN
        UPDATE public.services SET status = new_status WHERE id = new.entity_id;
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_status_from_event ON public.events;
CREATE TRIGGER trigger_update_status_from_event
AFTER INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.update_entity_status_from_event();
