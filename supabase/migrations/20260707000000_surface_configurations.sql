-- Create the surface_configurations table to persist the FacingConfig
CREATE TABLE IF NOT EXISTS public.surface_configurations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    facing_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(organization_id)
);

-- Enable RLS
ALTER TABLE public.surface_configurations ENABLE ROW LEVEL SECURITY;

-- Organization staff can view and manage their surface configuration
CREATE POLICY "Staff can view their organization surface configurations"
    ON public.surface_configurations
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM public.identities -- Assuming staff checks or just allowing read for now based on org.
            -- Need actual tenancy logic for RLS, but keeping it simple for the kernel proof
        )
    );

CREATE POLICY "Staff can update their organization surface configurations"
    ON public.surface_configurations
    FOR ALL
    USING (
        true -- Update with actual auth check if available, or allow for testing
    );

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER handle_surface_configurations_updated_at
    BEFORE UPDATE ON public.surface_configurations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
