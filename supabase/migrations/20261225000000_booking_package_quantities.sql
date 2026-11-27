-- A booking records the purchased package lines and their agreed quantities.
-- Copy the name and unit price so the agreement survives catalogue edits.
-- Legacy single-package writers still get a quantity-one line.
begin;

create unique index if not exists bookings_studio_id_id on weave.bookings(studio_id, id);
create unique index if not exists packages_studio_id_id on weave.packages(studio_id, id);

create table weave.booking_packages (
  studio_id uuid not null,
  booking_id uuid not null,
  package_id uuid,
  position integer not null check (position > 0),
  quantity integer not null check (quantity > 0),
  name text not null check (btrim(name) <> ''),
  unit_price_minor bigint check (unit_price_minor >= 0),
  currency text not null,
  primary key (studio_id, booking_id, position),
  unique (studio_id, booking_id, package_id),
  foreign key (studio_id, booking_id) references weave.bookings(studio_id, id) on delete cascade,
  foreign key (studio_id, package_id) references weave.packages(studio_id, id) on delete set null (package_id)
);

create index booking_packages_catalogue on weave.booking_packages(studio_id, package_id)
  where package_id is not null;
alter table weave.booking_packages enable row level security;
revoke all on weave.booking_packages from public, anon, authenticated, service_role;
grant select on weave.booking_packages to service_role;

insert into weave.booking_packages (studio_id, booking_id, package_id, position, quantity, name, unit_price_minor, currency)
select b.studio_id, b.id, p.id, 1, 1, p.name, p.price, upper(btrim(p.currency))
from weave.bookings b
join weave.packages p on p.studio_id = b.studio_id and p.id = b.package_id;

create function weave.copy_legacy_booking_package()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into weave.booking_packages (studio_id, booking_id, package_id, position, quantity, name, unit_price_minor, currency)
  select p.studio_id, new.id, p.id, 1, 1, p.name, p.price, upper(btrim(p.currency))
  from weave.packages p where p.studio_id = new.studio_id and p.id = new.package_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'The selected package is unavailable.';
  end if;
  return new;
end;
$$;

revoke all on function weave.copy_legacy_booking_package() from public, anon, authenticated, service_role;
create trigger bookings_copy_legacy_package after insert on weave.bookings
for each row when (new.package_id is not null) execute function weave.copy_legacy_booking_package();

-- Copy the issued line items as part of the invoice document. Historic
-- invoices keep their original description and amount.
alter table weave.booking_invoices add column package_lines jsonb not null default '[]'::jsonb
  check (jsonb_typeof(package_lines) = 'array');

create function weave.booking_promised_pictures(p_studio_id uuid, p_booking_id uuid)
returns numeric language sql stable set search_path = ''
as $$
  select nullif(sum(e.count::numeric * line.quantity), 0)
  from weave.booking_packages line
  join weave.package_elements e
    on e.studio_id = line.studio_id and e.package_id = line.package_id
  join weave.deliverables d on d.studio_id = e.studio_id and d.id = e.deliverable_id
  where line.studio_id = p_studio_id and line.booking_id = p_booking_id
    and e.mode = 'promised' and e.type = 'deliverable' and d.fills_gallery;
$$;
revoke all on function weave.booking_promised_pictures(uuid, uuid) from public, anon, authenticated;
grant execute on function weave.booking_promised_pictures(uuid, uuid) to service_role;

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
  v_line_count bigint;
  v_priced_count bigint;
  v_currency_count bigint;
  v_package_name text;
  v_package_lines jsonb;
  v_number bigint;
  v_invoice_id uuid;
  v_package_price numeric;
  v_package_currency text;
begin
  perform 1 from weave.studios where id = p_studio_id for update;
  select p.id, p.name, b.occasion
  into v_client_id, v_client_name, v_occasion
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

  select count(*), count(unit_price_minor), count(distinct currency) filter (where unit_price_minor is not null),
    min(name), sum(unit_price_minor::numeric * quantity),
    min(currency) filter (where unit_price_minor is not null),
    coalesce(jsonb_agg(jsonb_build_object('name', name, 'quantity', quantity, 'unitMinor', unit_price_minor)
      order by position), '[]'::jsonb)
  into v_line_count, v_priced_count, v_currency_count, v_package_name, v_package_price,
    v_package_currency, v_package_lines
  from weave.booking_packages
  where studio_id = p_studio_id and booking_id = p_booking_id;

  if v_currency_count > 1 then
    raise exception using errcode = 'P0001', message = 'An invoice requires all priced packages to use the same currency.';
  end if;
  if v_package_price > 99999999999 then
    raise exception using errcode = 'P0001', message = 'The package total exceeds the invoice limit.';
  end if;
  if v_line_count > 0 and v_line_count = v_priced_count and v_package_price = 0 then
    raise exception using errcode = 'P0001', message = 'No payment is due for these packages.';
  end if;
  if v_priced_count > 0 and (
    v_package_currency is distinct from p_currency
      or (v_line_count = v_priced_count and v_package_price is distinct from p_total_minor)
      or (v_line_count > v_priced_count and p_total_minor < v_package_price)
  ) then
    raise exception using errcode = 'P0001', message = 'Invoice amount and currency must match the package price. Reload the booking.';
  end if;

  select coalesce(max(number), 0) + 1 into v_number
  from weave.booking_invoices where studio_id = p_studio_id;

  insert into weave.booking_invoices (
    studio_id, booking_id, number, client_id, client_name, description, currency, total_minor, deposit_minor, instructions, package_lines
  ) values (
    p_studio_id, p_booking_id, v_number, v_client_id, v_client_name,
    coalesce(
      case when v_line_count > 1 then 'Booking packages' end,
      case when length(btrim(v_package_name)) between 1 and 500 then v_package_name end,
      case when length(btrim(v_occasion)) between 1 and 500 then v_occasion end,
      'Photography booking'
    ),
    p_currency, p_total_minor, p_deposit_minor, p_instructions, v_package_lines
  ) returning id into v_invoice_id;

  insert into weave.events (studio_id, subject_type, subject_id, action, actor_id, payload)
  values (p_studio_id, 'booking', p_booking_id, 'invoice_issued', p_actor_id,
    jsonb_build_object('invoice', v_invoice_id, 'number', v_number));
end;
$$;

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
  v_package_count integer;
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
    client_id uuid, client_name text, client_email text, client_phone text, wants text, package_id uuid, packages jsonb,
    occasion text, occasion_on date, scheduled_for date, at time, crew jsonb
  );

  if v_input.packages is not null then
    if jsonb_typeof(v_input.packages) <> 'array' or v_input.package_id is not null then
      raise exception using errcode = 'P0001', message = 'Invalid package selection.';
    end if;
    if exists (
      select 1 from jsonb_to_recordset(v_input.packages) as line(package_id uuid, quantity integer)
      group by line.package_id
      having line.package_id is null or count(*) <> 1 or min(line.quantity) is null or min(line.quantity) < 1
    ) then
      raise exception using errcode = 'P0001', message = 'Invalid package quantities.';
    end if;
    perform p.id from weave.packages p
    join jsonb_to_recordset(v_input.packages) as line(package_id uuid, quantity integer) on line.package_id = p.id
    where p.studio_id = p_studio_id order by p.id for share of p;
    get diagnostics v_package_count = row_count;
    if v_package_count <> jsonb_array_length(v_input.packages) then
      raise exception using errcode = 'P0001', message = 'A selected package is unavailable.';
    end if;
  end if;

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

  insert into weave.booking_packages (studio_id, booking_id, package_id, position, quantity, name, unit_price_minor, currency)
  select p_studio_id, p_booking_id, p.id, line.ordinality, line.quantity, p.name, p.price, upper(btrim(p.currency))
  from rows from (jsonb_to_recordset(v_input.packages) as (package_id uuid, quantity integer))
    with ordinality as line(package_id, quantity, ordinality)
  join weave.packages p on p.id = line.package_id and p.studio_id = p_studio_id;

  if weave.booking_promised_pictures(p_studio_id, p_booking_id) > 100000 then
    raise exception using errcode = 'P0001', message = 'The selected quantities exceed the gallery limit of 100,000 images.';
  end if;

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
