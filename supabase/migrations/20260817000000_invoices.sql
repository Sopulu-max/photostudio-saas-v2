-- Invoices: the document between what was booked and what was paid.
--
-- The commercial plane in the ontology runs Package -> Booking and stops, so
-- money was never modelled. raiseInvoiceForBooking took a typed-in amount and
-- a label while the booking beside it already knew exactly what was sold.
-- This closes that: an invoice is generated from booking_lines, the same way
-- a booking line is generated from a package.
--
--   Package -> booking line (price snapshot) -> invoice line (billing snapshot)
--
-- Each step copies rather than references, for the reason line prices already
-- do: re-pricing a package next month must not rewrite a document a client has
-- already been sent.
--
-- There is no receipts table. A receipt is what an invoice looks like once its
-- payments cover it — the same document answering "have I been paid?". A
-- separate entity would be the same mistake as inventing Offering.

create table if not exists invoices (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references organizations(id) on delete cascade,

    -- Null until issued. A number is spent at the moment of issuing, never on
    -- a draft, so the studio's sequence has no gaps to explain to an auditor.
    number           text,

    booking_id       uuid references bookings(id) on delete set null,
    contact_id       uuid references contacts(id) on delete set null,
    contract_id      uuid references contracts(id) on delete set null,

    -- draft: still being written. issued: sent, frozen. void: withdrawn.
    -- Whether it is *paid* is deliberately not here — that is derived from the
    -- payments against it, so it can never drift from the money itself.
    status           text not null default 'draft'
                     check (status in ('draft', 'issued', 'void')),

    currency         text not null default 'USD',
    notes            text,

    -- Room for tax without pretending to implement it. Nothing reads or writes
    -- these yet; they exist because retrofitting tax means rewriting totals on
    -- documents already sent to clients, which is the one record you cannot
    -- quietly change.
    tax_rate         numeric(6, 4),
    tax_amount       numeric(12, 2),

    -- The client's capability to view it, exactly like a delivery's gallery.
    share_token      text unique,

    issued_at        timestamptz,
    due_at           timestamptz,
    voided_at        timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),

    unique (organization_id, number)
);

create index if not exists idx_invoices_org on invoices(organization_id, status);
create index if not exists idx_invoices_booking on invoices(booking_id);
create index if not exists idx_invoices_contact on invoices(contact_id);

create table if not exists invoice_lines (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references organizations(id) on delete cascade,
    invoice_id       uuid not null references invoices(id) on delete cascade,

    -- Where this came from, kept for provenance only. Nulling it if the booking
    -- line is later removed must not alter what the client was billed.
    booking_line_id  uuid references booking_lines(id) on delete set null,

    description      text not null,
    quantity         numeric(12, 2) not null default 1,
    unit_price       numeric(12, 2) not null default 0,
    -- Stored rather than computed: it is the figure on the document.
    amount           numeric(12, 2) not null default 0,
    position         integer not null default 0,
    created_at       timestamptz not null default now()
);

create index if not exists idx_invoice_lines_invoice on invoice_lines(invoice_id);

-- Payments pay an invoice down. A transaction without one is still valid — a
-- cost, or money taken before anything was written up.
alter table financial_transactions
    add column if not exists invoice_id uuid references invoices(id) on delete set null;

create index if not exists idx_ft_invoice on financial_transactions(invoice_id);

-- The studio's own running number. A counter on the organization rather than a
-- sequence per studio: `update ... returning` is atomic, so two operators
-- issuing at once cannot land on the same number, and it stays inspectable.
alter table organizations
    add column if not exists invoice_seq integer not null default 0;

-- Same isolation as every other table, and read-only from the browser like the
-- rest — every write goes through the module on the service role.
alter table invoices enable row level security;
alter table invoice_lines enable row level security;

drop policy if exists "Tenant Isolation" on invoices;
create policy "Tenant Isolation" on invoices
    for select using (organization_id in (select auth_org_ids()));

drop policy if exists "Tenant Isolation" on invoice_lines;
create policy "Tenant Isolation" on invoice_lines
    for select using (organization_id in (select auth_org_ids()));
