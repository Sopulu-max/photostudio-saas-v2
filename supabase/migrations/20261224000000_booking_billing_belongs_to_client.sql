-- The billed person is part of an issued invoice, alongside the name as
-- printed. Later booking edits must not transfer access to that invoice.
begin;

create unique index if not exists people_studio_id_id on weave.people(studio_id, id);

alter table weave.booking_invoices add column client_id uuid,
  add constraint booking_invoices_billed_client_fkey
    foreign key (studio_id, client_id) references weave.people(studio_id, id)
    on delete set null (client_id);

update weave.booking_invoices i set client_id = p.id
from weave.bookings b
join weave.people p on p.id = b.client_id and p.studio_id = b.studio_id
where b.id = i.booking_id and b.studio_id = i.studio_id;

create index booking_invoices_billed_client
  on weave.booking_invoices(studio_id, client_id, number desc) where client_id is not null;

create or replace function weave.issue_booking_invoice(
  p_studio_id uuid, p_booking_id uuid, p_actor_id uuid, p_description text,
  p_currency text, p_total_minor bigint, p_deposit_minor bigint, p_instructions text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_client_id uuid;
  v_client_name text;
  v_occasion text;
  v_package_name text;
  v_number bigint;
  v_invoice_id uuid;
  v_package_id uuid;
  v_package_price bigint;
  v_package_currency text;
begin
  perform 1 from weave.studios where id = p_studio_id for update;
  select p.id, p.name, b.package_id, b.occasion
  into v_client_id, v_client_name, v_package_id, v_occasion
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

  if v_package_id is not null then
    select name, price, upper(btrim(currency)) into v_package_name, v_package_price, v_package_currency
    from weave.packages
    where id = v_package_id and studio_id = p_studio_id
    for share;
    if not found then
      raise exception using errcode = 'P0001', message = 'The booked package is unavailable.';
    end if;
  end if;

  if v_package_price = 0 then
    raise exception using errcode = 'P0001', message = 'No payment is due for this package.';
  end if;
  if v_package_price is not null and (
    v_package_price is distinct from p_total_minor or v_package_currency is distinct from p_currency
  ) then
    raise exception using errcode = 'P0001', message = 'Invoice amount and currency must match the package price. Reload the booking.';
  end if;

  select coalesce(max(number), 0) + 1 into v_number
  from weave.booking_invoices where studio_id = p_studio_id;

  insert into weave.booking_invoices (
    studio_id, booking_id, number, client_id, client_name, description, currency, total_minor, deposit_minor, instructions
  ) values (
    p_studio_id, p_booking_id, v_number, v_client_id, v_client_name,
    coalesce(
      case when length(btrim(v_package_name)) between 1 and 500 then v_package_name end,
      case when length(btrim(v_occasion)) between 1 and 500 then v_occasion end,
      'Photography booking'
    ),
    case when v_package_price is null then p_currency else v_package_currency end,
    coalesce(v_package_price, p_total_minor), p_deposit_minor, p_instructions
  ) returning id into v_invoice_id;

  insert into weave.events (studio_id, subject_type, subject_id, action, actor_id, payload)
  values (p_studio_id, 'booking', p_booking_id, 'invoice_issued', p_actor_id,
    jsonb_build_object('invoice', v_invoice_id, 'number', v_number));
end;
$$;

-- An operator picks an existing client by ID or explicitly creates one.
-- A name and contact details provide no basis for reassigning billing history.
create or replace function weave.start_studio_booking(
  p_studio_id uuid, p_actor_id uuid, p_booking_id uuid, p_booking jsonb, p_invoice jsonb
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_input record;
  v_client_id uuid;
  v_client_name text;
  v_invoice_id uuid;
  v_receipt jsonb;
  v_submission text;
begin
  perform 1 from weave.studios where id = p_studio_id for update;
  perform 1 from weave.people
  where id = p_actor_id and studio_id = p_studio_id and joined_at is not null and left_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'Sign in to start a booking.';
  end if;

  v_submission := encode(sha256(convert_to(jsonb_build_array(p_booking, p_invoice)::text, 'UTF8')), 'hex');
  if exists (select 1 from weave.bookings where studio_id = p_studio_id and id = p_booking_id) then
    if exists (
      select 1 from weave.events
      where studio_id = p_studio_id and subject_type = 'booking' and subject_id = p_booking_id
        and action = 'started' and actor_id = p_actor_id and payload ->> 'submission' = v_submission
    ) then return false; end if;
    raise exception using errcode = 'P0001', message = 'The booking was already saved. Open it to make changes.';
  end if;

  select * into v_input from jsonb_to_record(p_booking) as details(
    client_id uuid, client_name text, client_email text, client_phone text, wants text, package_id uuid,
    occasion text, occasion_on date, scheduled_for date, at time, crew jsonb
  );

  if v_input.package_id is not null then
    perform 1 from weave.packages where studio_id = p_studio_id and id = v_input.package_id for share;
    if not found then
      raise exception using errcode = 'P0001', message = 'The selected package is unavailable.';
    end if;
  end if;

  if v_input.client_id is null then
    if nullif(btrim(v_input.client_name), '') is null
      or nullif(btrim(v_input.client_email), '') is null
      or nullif(btrim(v_input.client_phone), '') is null then
      raise exception using errcode = 'P0001', message = 'A client name, email address and phone number are required.';
    end if;
    insert into weave.people (studio_id, name, email, phone)
    values (p_studio_id, v_input.client_name, v_input.client_email, v_input.client_phone)
    returning id, name into v_client_id, v_client_name;
  else
    select p.id, p.name into v_client_id, v_client_name from weave.people p
    where p.id = v_input.client_id and p.studio_id = p_studio_id and p.joined_at is null
      and exists (select 1 from weave.bookings b where b.studio_id = p_studio_id and b.client_id = p.id)
    for update of p;
    if not found then
      raise exception using errcode = 'P0001', message = 'The selected client is unavailable.';
    end if;
    update weave.people
    set email = coalesce(nullif(email, ''), v_input.client_email),
        phone = coalesce(nullif(phone, ''), v_input.client_phone)
    where studio_id = p_studio_id and id = v_client_id
      and (coalesce(email, '') = '' or coalesce(phone, '') = '');
  end if;

  insert into weave.bookings (
    id, studio_id, client_id, wants, package_id, occasion, occasion_on, scheduled_for, at, turn, accepted_at
  ) values (
    p_booking_id, p_studio_id, v_client_id, v_input.wants, v_input.package_id, v_input.occasion,
    v_input.occasion_on, v_input.scheduled_for, v_input.at,
    case when v_input.scheduled_for is null then 'us' else 'scheduled' end, now()
  );

  insert into weave.crew (studio_id, booking_id, person_id)
  select distinct p_studio_id, p_booking_id, person.id
  from jsonb_to_recordset(v_input.crew) as mate(person_id uuid, role text)
  join weave.people person on person.id = mate.person_id and person.studio_id = p_studio_id
  where person.joined_at is not null and person.left_at is null;

  update weave.people person set role = mate.role
  from jsonb_to_recordset(v_input.crew) as mate(person_id uuid, role text)
  where person.id = mate.person_id and person.studio_id = p_studio_id
    and person.joined_at is not null and person.left_at is null
    and coalesce(person.role, '') = '' and nullif(btrim(mate.role), '') is not null;

  insert into weave.events (studio_id, subject_type, subject_id, action, actor_id, payload)
  values (p_studio_id, 'booking', p_booking_id, 'started', p_actor_id,
    jsonb_build_object('client', v_client_name, 'submission', v_submission));

  if p_invoice is not null then
    perform weave.issue_booking_invoice(
      p_studio_id, p_booking_id, p_actor_id, p_invoice->>'description', p_invoice->>'currency',
      (p_invoice->>'total_minor')::bigint, (p_invoice->>'deposit_minor')::bigint, p_invoice->>'instructions'
    );

    v_receipt := p_invoice->'receipt';
    if jsonb_typeof(v_receipt) = 'object' then
      select id into strict v_invoice_id from weave.booking_invoices
      where studio_id = p_studio_id and booking_id = p_booking_id and voided_at is null;
      perform weave.record_booking_payment(
        p_studio_id, p_booking_id, p_actor_id, v_invoice_id, gen_random_uuid(),
        (v_receipt->>'amount_minor')::bigint, (v_receipt->>'received_on')::date, v_receipt->>'reference'
      );
    end if;
  end if;
  return true;
end;
$$;

notify pgrst, 'reload schema';
commit;
