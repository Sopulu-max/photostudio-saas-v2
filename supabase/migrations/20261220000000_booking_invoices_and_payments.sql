-- An invoice is the agreed price of a booking at the time it was issued.
-- Package prices may change. An issued amount, currency and description do not.
-- Existing bookings gain an invoice when the studio confirms the price.
begin;

create table if not exists weave.booking_invoices (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references weave.studios(id) on delete cascade,
  booking_id uuid not null references weave.bookings(id),
  number bigint not null check (number > 0),
  share_token uuid not null unique default gen_random_uuid(),
  client_name text,
  description text not null check (length(btrim(description)) between 1 and 500),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_minor bigint not null check (total_minor between 1 and 99999999999),
  deposit_minor bigint check (deposit_minor > 0 and deposit_minor <= total_minor),
  instructions text check (length(instructions) <= 2000),
  issued_at timestamptz not null default now(),
  voided_at timestamptz,
  unique (studio_id, number),
  unique (studio_id, id)
);

-- Corrections get a new number and a new link. A voided invoice stays in the
-- booking's history, and its old link cannot collect any more payments.
create unique index if not exists booking_invoices_one_active
  on weave.booking_invoices(studio_id, booking_id) where voided_at is null;
create index if not exists booking_invoices_booking
  on weave.booking_invoices(studio_id, booking_id, number desc);

-- Money received is a fact. Multiple entries may settle one invoice, and the
-- same entry can be retried without adding another payment. Voiding an entry
-- corrects the record and retains the original amount and date.
create table if not exists weave.booking_payments (
  id uuid primary key,
  studio_id uuid not null references weave.studios(id) on delete cascade,
  invoice_id uuid not null,
  amount_minor bigint not null check (amount_minor between 1 and 99999999999),
  received_on date not null,
  reference text check (length(reference) <= 160),
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  foreign key (studio_id, invoice_id) references weave.booking_invoices(studio_id, id) on delete cascade
);
create index if not exists booking_payments_invoice
  on weave.booking_payments(studio_id, invoice_id);

alter table weave.booking_invoices enable row level security;
alter table weave.booking_payments enable row level security;
revoke all on weave.booking_invoices, weave.booking_payments from public, anon, authenticated, service_role;
grant select on weave.booking_invoices, weave.booking_payments to service_role;

-- A computed reading for both views of the invoice. Sum in the database so
-- the balance stays exact even if the payment history page is capped.
create or replace function weave.invoice_received_minor(p_invoice weave.booking_invoices)
returns bigint
language sql stable set search_path = ''
as $$
  select coalesce(sum(amount_minor), 0)::bigint
  from weave.booking_payments
  where studio_id = p_invoice.studio_id and invoice_id = p_invoice.id and voided_at is null;
$$;

create or replace function weave.issue_booking_invoice(
  p_studio_id uuid, p_booking_id uuid, p_actor_id uuid, p_description text,
  p_currency text, p_total_minor bigint, p_deposit_minor bigint, p_instructions text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_client_name text;
  v_number bigint;
  v_invoice_id uuid;
begin
  -- Lock the studio while assigning the next number. The same booking can
  -- never acquire two issued invoices, including concurrent requests.
  perform 1 from weave.studios where id = p_studio_id for update;
  select p.name into v_client_name
  from weave.bookings b
  left join weave.people p on p.id = b.client_id and p.studio_id = b.studio_id
  where b.id = p_booking_id and b.studio_id = p_studio_id and b.accepted_at is not null
  for update of b;
  if not found then
    raise exception using errcode = 'P0001', message = 'Invoice requires a confirmed booking.';
  end if;

  if exists (
    select 1 from weave.booking_invoices
    where studio_id = p_studio_id and booking_id = p_booking_id and voided_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'This booking already has an active invoice.';
  end if;

  select coalesce(max(number), 0) + 1 into v_number
  from weave.booking_invoices where studio_id = p_studio_id;

  insert into weave.booking_invoices (
    studio_id, booking_id, number, client_name, description, currency, total_minor, deposit_minor, instructions
  ) values (
    p_studio_id, p_booking_id, v_number, v_client_name, p_description,
    p_currency, p_total_minor, p_deposit_minor, p_instructions
  ) returning id into v_invoice_id;

  insert into weave.events (studio_id, subject_type, subject_id, action, actor_id, payload)
  values (p_studio_id, 'booking', p_booking_id, 'invoice_issued', p_actor_id,
    jsonb_build_object('invoice', v_invoice_id, 'number', v_number));
end;
$$;

create or replace function weave.record_booking_payment(
  p_studio_id uuid, p_booking_id uuid, p_actor_id uuid, p_invoice_id uuid,
  p_payment_id uuid, p_amount_minor bigint, p_received_on date, p_reference text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_invoice weave.booking_invoices%rowtype;
  v_existing weave.booking_payments%rowtype;
  v_received bigint;
begin
  -- All money and void operations lock this invoice before reading its
  -- payments, so two simultaneous receipts cannot both spend the balance.
  select * into v_invoice from weave.booking_invoices
  where studio_id = p_studio_id and booking_id = p_booking_id and id = p_invoice_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Invoice unavailable.';
  end if;

  select * into v_existing from weave.booking_payments
  where studio_id = p_studio_id and invoice_id = p_invoice_id and id = p_payment_id;
  if found then
    if v_existing.voided_at is not null then
      raise exception using errcode = 'P0001', message = 'This payment entry was voided. Reload the booking.';
    end if;
    if v_existing.amount_minor = p_amount_minor and v_existing.received_on = p_received_on
      and v_existing.reference is not distinct from p_reference then return; end if;
    raise exception using errcode = 'P0001', message = 'This payment entry already exists. Reload the booking.';
  end if;

  if v_invoice.voided_at is not null then
    raise exception using errcode = 'P0001', message = 'This invoice has been voided.';
  end if;
  if p_received_on > current_date + 1 then
    raise exception using errcode = 'P0001', message = 'The received date cannot be in the future.';
  end if;

  v_received := weave.invoice_received_minor(v_invoice);
  if p_amount_minor > v_invoice.total_minor - v_received then
    raise exception using errcode = 'P0001', message = 'Payment exceeds the outstanding balance.';
  end if;

  insert into weave.booking_payments (id, studio_id, invoice_id, amount_minor, received_on, reference)
  values (p_payment_id, p_studio_id, p_invoice_id, p_amount_minor, p_received_on, p_reference);

  insert into weave.events (studio_id, subject_type, subject_id, action, actor_id, payload)
  values (p_studio_id, 'booking', p_booking_id, 'payment_recorded', p_actor_id,
    jsonb_build_object('invoice', p_invoice_id, 'payment', p_payment_id));
end;
$$;

create or replace function weave.void_booking_payment(
  p_studio_id uuid, p_booking_id uuid, p_actor_id uuid, p_invoice_id uuid, p_payment_id uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from weave.booking_invoices
  where studio_id = p_studio_id and booking_id = p_booking_id and id = p_invoice_id and voided_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Active invoice unavailable.';
  end if;

  update weave.booking_payments set voided_at = now()
  where studio_id = p_studio_id and invoice_id = p_invoice_id and id = p_payment_id and voided_at is null;
  if not found then
    if exists (
      select 1 from weave.booking_payments
      where studio_id = p_studio_id and invoice_id = p_invoice_id and id = p_payment_id
    ) then return; end if;
    raise exception using errcode = 'P0001', message = 'Payment entry unavailable.';
  end if;

  insert into weave.events (studio_id, subject_type, subject_id, action, actor_id, payload)
  values (p_studio_id, 'booking', p_booking_id, 'payment_voided', p_actor_id,
    jsonb_build_object('invoice', p_invoice_id, 'payment', p_payment_id));
end;
$$;

create or replace function weave.void_booking_invoice(
  p_studio_id uuid, p_booking_id uuid, p_actor_id uuid, p_invoice_id uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_voided_at timestamptz;
begin
  select voided_at into v_voided_at from weave.booking_invoices
  where studio_id = p_studio_id and booking_id = p_booking_id and id = p_invoice_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Invoice unavailable.';
  end if;
  if v_voided_at is not null then return; end if;

  if exists (
    select 1 from weave.booking_payments
    where studio_id = p_studio_id and invoice_id = p_invoice_id and voided_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'An invoice with recorded payments cannot be voided.';
  end if;

  update weave.booking_invoices set voided_at = now()
  where studio_id = p_studio_id and booking_id = p_booking_id and id = p_invoice_id;

  insert into weave.events (studio_id, subject_type, subject_id, action, actor_id, payload)
  values (p_studio_id, 'booking', p_booking_id, 'invoice_voided', p_actor_id,
    jsonb_build_object('invoice', p_invoice_id));
end;
$$;

revoke all on function weave.issue_booking_invoice(uuid, uuid, uuid, text, text, bigint, bigint, text)
  from public, anon, authenticated;
revoke all on function weave.record_booking_payment(uuid, uuid, uuid, uuid, uuid, bigint, date, text)
  from public, anon, authenticated;
revoke all on function weave.void_booking_payment(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function weave.void_booking_invoice(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function weave.invoice_received_minor(weave.booking_invoices)
  from public, anon, authenticated;
grant execute on function weave.issue_booking_invoice(uuid, uuid, uuid, text, text, bigint, bigint, text)
  to service_role;
grant execute on function weave.record_booking_payment(uuid, uuid, uuid, uuid, uuid, bigint, date, text)
  to service_role;
grant execute on function weave.void_booking_payment(uuid, uuid, uuid, uuid, uuid)
  to service_role;
grant execute on function weave.void_booking_invoice(uuid, uuid, uuid, uuid)
  to service_role;
grant execute on function weave.invoice_received_minor(weave.booking_invoices)
  to service_role;

notify pgrst, 'reload schema';
commit;
