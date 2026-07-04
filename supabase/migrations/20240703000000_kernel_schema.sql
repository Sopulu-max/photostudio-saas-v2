-- 20240703000000_kernel_schema.sql

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ==========================================
-- LAYER 1: EXISTENCE
-- ==========================================

create table public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    status text not null default 'active',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    archived_at timestamp with time zone
);

create table public.identities (
    organization_id uuid primary key references public.organizations(id) on delete restrict,
    name text not null,
    logo_url text,
    brand_colors jsonb default '{}'::jsonb,
    typography jsonb default '{}'::jsonb,
    contact_data jsonb default '{}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.services (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    name text not null,
    description text,
    pricing_rules jsonb default '{}'::jsonb,
    required_fields jsonb default '{}'::jsonb,
    status text not null default 'active',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.customers (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    primary_identifier text not null,
    profile_data jsonb default '{}'::jsonb,
    status text not null default 'active',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);


-- ==========================================
-- LAYER 2: INTERACTION
-- ==========================================

create table public.requests (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    customer_id uuid not null references public.customers(id) on delete restrict,
    status text not null default 'created' check (status in ('created', 'reviewed', 'accepted', 'declined', 'withdrawn', 'expired')),
    requested_services jsonb default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.agreements (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    customer_id uuid not null references public.customers(id) on delete restrict,
    request_id uuid references public.requests(id) on delete restrict,
    status text not null default 'proposed' check (status in ('proposed', 'active', 'completed', 'cancelled')),
    terms jsonb default '{}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);


-- ==========================================
-- LAYER 3: TRANSFORMATION
-- ==========================================

create table public.service_instances (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    agreement_id uuid not null references public.agreements(id) on delete restrict,
    service_id uuid not null references public.services(id) on delete restrict,
    status text not null default 'created' check (status in ('created', 'scheduled', 'in_progress', 'waiting', 'completed', 'delivered', 'archived', 'halted')),
    fulfillment_data jsonb default '{}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.assets (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    origin_type text not null check (origin_type in ('produced', 'provided')),
    origin_instance_id uuid references public.service_instances(id) on delete restrict,
    origin_customer_id uuid references public.customers(id) on delete restrict,
    content_reference text not null,
    status text not null default 'registered' check (status in ('registered', 'available', 'in_use', 'retained', 'released')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    -- Ensure origin matches origin_type
    constraint asset_origin_check check (
        (origin_type = 'produced' and origin_instance_id is not null) or
        (origin_type = 'provided' and origin_customer_id is not null)
    )
);

create table public.instance_consumed_assets (
    instance_id uuid not null references public.service_instances(id) on delete restrict,
    asset_id uuid not null references public.assets(id) on delete restrict,
    consumed_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (instance_id, asset_id)
);


-- ==========================================
-- THE EVENT STREAM
-- ==========================================

create table public.events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    entity_type text not null,
    entity_id uuid not null,
    event_type text not null,
    payload jsonb default '{}'::jsonb,
    actor_id uuid,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);


-- ==========================================
-- INDEXES & PERFORMANCE
-- ==========================================

create index idx_events_organization on public.events(organization_id);
create index idx_events_entity on public.events(entity_type, entity_id);
create index idx_assets_origin_instance on public.assets(origin_instance_id);
create index idx_assets_origin_customer on public.assets(origin_customer_id);
create index idx_service_instances_agreement on public.service_instances(agreement_id);
create index idx_agreements_customer on public.agreements(customer_id);
create index idx_requests_customer on public.requests(customer_id);


-- ==========================================
-- AUTOMATION TRIGGERS (CQRS Light)
-- ==========================================

-- 1. Trigger to automatically update updated_at timestamp
create or replace function public.update_modified_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- Apply updated_at trigger to relevant tables
create trigger update_identities_modtime before update on public.identities for each row execute function update_modified_column();
create trigger update_services_modtime before update on public.services for each row execute function update_modified_column();
create trigger update_customers_modtime before update on public.customers for each row execute function update_modified_column();
create trigger update_requests_modtime before update on public.requests for each row execute function update_modified_column();
create trigger update_agreements_modtime before update on public.agreements for each row execute function update_modified_column();
create trigger update_service_instances_modtime before update on public.service_instances for each row execute function update_modified_column();
create trigger update_assets_modtime before update on public.assets for each row execute function update_modified_column();

-- 2. CQRS Light Trigger: Automatically derive 'status' from the event stream
create or replace function public.update_entity_status_from_event()
returns trigger as $$
declare
    new_status text;
begin
    -- Extract the status from event_type (e.g. "agreement.active" -> "active")
    new_status := split_part(new.event_type, '.', 2);
    
    -- agreement.modified is an event, but it does NOT change the status of the agreement.
    if new.entity_type = 'agreement' and new_status = 'modified' then
        return new;
    end if;
    
    -- Validate and apply based on canonical unions
    if new.entity_type = 'agreement' and new_status in ('proposed', 'active', 'completed', 'cancelled') then
        update public.agreements set status = new_status where id = new.entity_id;
    elsif new.entity_type = 'request' and new_status in ('created', 'reviewed', 'accepted', 'declined', 'withdrawn', 'expired') then
        update public.requests set status = new_status where id = new.entity_id;
    elsif new.entity_type = 'service_instance' and new_status in ('created', 'scheduled', 'in_progress', 'waiting', 'completed', 'delivered', 'archived', 'halted') then
        update public.service_instances set status = new_status where id = new.entity_id;
    elsif new.entity_type = 'asset' and new_status in ('registered', 'available', 'in_use', 'retained', 'released') then
        update public.assets set status = new_status where id = new.entity_id;
    end if;
    
    return new;
end;
$$ language plpgsql security definer;

create trigger trigger_update_status_from_event
after insert on public.events
for each row
execute function public.update_entity_status_from_event();

-- ==========================================
-- ROW LEVEL SECURITY (TENANCY)
-- ==========================================

-- Enable RLS on all tables
alter table public.organizations enable row level security;
alter table public.identities enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.requests enable row level security;
alter table public.agreements enable row level security;
alter table public.service_instances enable row level security;
alter table public.assets enable row level security;
alter table public.instance_consumed_assets enable row level security;
alter table public.events enable row level security;

-- In a real application, organizations would be linked to users via a join table.
-- For this architecture, we enforce tenancy by requiring the JWT to contain an 'org_id' claim.
-- Only rows matching that org_id can be read or written.

-- Helper function to get the current tenant ID
create or replace function public.current_tenant_id()
returns uuid as $$
  select (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid;
$$ language sql stable;

-- Apply policies to all tables except organizations (organizations policy relies on id, others rely on organization_id)
create policy tenant_isolation_identities on public.identities
    using (organization_id = public.current_tenant_id());
create policy tenant_isolation_services on public.services
    using (organization_id = public.current_tenant_id());
create policy tenant_isolation_customers on public.customers
    using (organization_id = public.current_tenant_id());
create policy tenant_isolation_requests on public.requests
    using (organization_id = public.current_tenant_id());
create policy tenant_isolation_agreements on public.agreements
    using (organization_id = public.current_tenant_id());
create policy tenant_isolation_service_instances on public.service_instances
    using (organization_id = public.current_tenant_id());
create policy tenant_isolation_assets on public.assets
    using (organization_id = public.current_tenant_id());
create policy tenant_isolation_events on public.events
    using (organization_id = public.current_tenant_id());

-- The instance_consumed_assets table links two tables. We policy it based on the instance's org.
create policy tenant_isolation_instance_consumed_assets on public.instance_consumed_assets
    using (instance_id in (select id from public.service_instances where organization_id = public.current_tenant_id()));

-- Organizations policy
create policy tenant_isolation_organizations on public.organizations
    using (id = public.current_tenant_id());
