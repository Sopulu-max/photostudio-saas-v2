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
    organization_id uuid primary key references public.organizations(id) on delete cascade,
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
    organization_id uuid not null references public.organizations(id) on delete cascade,
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
    organization_id uuid not null references public.organizations(id) on delete cascade,
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
    organization_id uuid not null references public.organizations(id) on delete cascade,
    customer_id uuid not null references public.customers(id) on delete cascade,
    status text not null default 'received',
    requested_services jsonb default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.agreements (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    customer_id uuid not null references public.customers(id) on delete cascade,
    request_id uuid references public.requests(id) on delete set null,
    status text not null default 'confirmed',
    terms jsonb default '{}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);


-- ==========================================
-- LAYER 3: TRANSFORMATION
-- ==========================================

create table public.service_instances (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    agreement_id uuid not null references public.agreements(id) on delete cascade,
    service_id uuid not null references public.services(id) on delete cascade,
    status text not null default 'created',
    fulfillment_data jsonb default '{}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.assets (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    origin_type text not null check (origin_type in ('produced', 'provided')),
    origin_instance_id uuid references public.service_instances(id) on delete set null,
    origin_customer_id uuid references public.customers(id) on delete set null,
    content_reference text not null,
    status text not null default 'registered',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    -- Ensure origin matches origin_type
    constraint asset_origin_check check (
        (origin_type = 'produced' and origin_instance_id is not null) or
        (origin_type = 'provided' and origin_customer_id is not null)
    )
);

create table public.instance_consumed_assets (
    instance_id uuid not null references public.service_instances(id) on delete cascade,
    asset_id uuid not null references public.assets(id) on delete cascade,
    consumed_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (instance_id, asset_id)
);


-- ==========================================
-- THE EVENT STREAM
-- ==========================================

create table public.events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
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
    -- Extract the status from event_type (e.g. "agreement.confirmed" -> "confirmed")
    new_status := split_part(new.event_type, '.', 2);
    
    -- Only update status if it's a known state transition (avoid breaking on events like 'customer.contacted')
    -- For safety, we only apply this logic to the core interaction/transformation entities.
    
    if new.entity_type = 'agreement' then
        update public.agreements set status = new_status where id = new.entity_id;
    elsif new.entity_type = 'request' then
        update public.requests set status = new_status where id = new.entity_id;
    elsif new.entity_type = 'service_instance' then
        update public.service_instances set status = new_status where id = new.entity_id;
    elsif new.entity_type = 'asset' then
        update public.assets set status = new_status where id = new.entity_id;
    end if;
    
    return new;
end;
$$ language plpgsql security definer;

create trigger trigger_update_status_from_event
after insert on public.events
for each row
execute function public.update_entity_status_from_event();
