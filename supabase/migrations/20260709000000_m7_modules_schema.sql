-- 20260709000000_m7_modules_schema.sql

-- ==========================================
-- FINANCE MODULE
-- ==========================================

create table public.invoices (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    agreement_id uuid not null references public.agreements(id) on delete restrict,
    status text not null default 'open' check (status in ('draft', 'open', 'paid', 'void')),
    total_amount numeric not null default 0,
    currency text not null default 'NGN',
    due_date timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.payments (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    invoice_id uuid not null references public.invoices(id) on delete restrict,
    amount numeric not null,
    status text not null default 'pending' check (status in ('pending', 'settled', 'failed')),
    method text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.expenses (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    amount numeric not null,
    currency text not null default 'NGN',
    description text not null,
    date timestamp with time zone not null default timezone('utc'::text, now()),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);


-- ==========================================
-- STAFF MODULE
-- ==========================================

create table public.staff (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    -- user_id would link to auth.users in a real deployment
    user_id uuid,
    name text not null,
    email text not null,
    role text not null default 'staff' check (role in ('admin', 'staff', 'contractor')),
    status text not null default 'active',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.capabilities (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    name text not null,
    description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.staff_capabilities (
    staff_id uuid not null references public.staff(id) on delete cascade,
    capability_id uuid not null references public.capabilities(id) on delete cascade,
    assigned_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (staff_id, capability_id)
);


-- ==========================================
-- NOTIFICATIONS MODULE
-- ==========================================

create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    customer_id uuid references public.customers(id) on delete cascade,
    staff_id uuid references public.staff(id) on delete cascade,
    trigger_event text not null,
    status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
    message text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    sent_at timestamp with time zone
);


-- ==========================================
-- INDEXES & TRIGGERS
-- ==========================================

create index idx_invoices_agreement on public.invoices(agreement_id);
create index idx_payments_invoice on public.payments(invoice_id);
create index idx_staff_org on public.staff(organization_id);
create index idx_notifications_customer on public.notifications(customer_id);

create trigger update_invoices_modtime before update on public.invoices for each row execute function update_modified_column();
create trigger update_payments_modtime before update on public.payments for each row execute function update_modified_column();
create trigger update_expenses_modtime before update on public.expenses for each row execute function update_modified_column();
create trigger update_staff_modtime before update on public.staff for each row execute function update_modified_column();


-- ==========================================
-- AUTOMATION: INVOICE DERIVATION
-- ==========================================
-- Derived Rows Doctrine: Nobody hand-creates an invoice. It is derived from the agreement.

create or replace function public.derive_invoice_from_agreement()
returns trigger as $$
declare
    v_price numeric;
begin
    -- Only act when agreement becomes active
    if new.status = 'active' and old.status = 'proposed' then
        
        -- Extract price from terms jsonb (fallback to 0 if not found)
        begin
            v_price := (new.terms->>'price')::numeric;
        exception when others then
            v_price := 0;
        end;

        -- Insert the derived invoice
        insert into public.invoices (
            organization_id, 
            agreement_id, 
            status, 
            total_amount,
            due_date
        ) values (
            new.organization_id,
            new.id,
            'open',
            coalesce(v_price, 0),
            now() + interval '7 days' -- default term
        );
    end if;
    
    return new;
end;
$$ language plpgsql security definer;

create trigger trigger_derive_invoice_on_activation
after update on public.agreements
for each row
execute function public.derive_invoice_from_agreement();


-- ==========================================
-- RLS POLICIES (TENANCY)
-- ==========================================

alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.staff enable row level security;
alter table public.capabilities enable row level security;
alter table public.staff_capabilities enable row level security;
alter table public.notifications enable row level security;

create policy tenant_isolation_invoices on public.invoices using (organization_id = public.current_tenant_id());
create policy tenant_isolation_payments on public.payments using (organization_id = public.current_tenant_id());
create policy tenant_isolation_expenses on public.expenses using (organization_id = public.current_tenant_id());
create policy tenant_isolation_staff on public.staff using (organization_id = public.current_tenant_id());
create policy tenant_isolation_capabilities on public.capabilities using (organization_id = public.current_tenant_id());
create policy tenant_isolation_notifications on public.notifications using (organization_id = public.current_tenant_id());
create policy tenant_isolation_staff_capabilities on public.staff_capabilities using (staff_id in (select id from public.staff where organization_id = public.current_tenant_id()));
