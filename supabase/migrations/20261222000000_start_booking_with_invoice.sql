-- Creating an invoice during a booking uses the same invoice and payment
-- rules as the booking detail page. This transaction keeps the booking, its
-- client and crew, and any financial entries together when validation fails.
begin;

create or replace function weave.start_studio_booking(
  p_studio_id uuid, p_actor_id uuid, p_booking_id uuid, p_booking jsonb, p_invoice jsonb
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_input record;
  v_client_id uuid;
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

  -- The same form can be sent again after a connection failure. Check that
  -- it is the same submission without copying client or invoice details into
  -- the activity log. A retry returns false, meaning no new booking was made.
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
    client_name text, client_email text, client_phone text, wants text, package_id uuid,
    occasion text, occasion_on date, scheduled_for date, at time, crew jsonb
  );
  if nullif(btrim(v_input.client_name), '') is null
    or nullif(btrim(v_input.client_email), '') is null
    or nullif(btrim(v_input.client_phone), '') is null then
    raise exception using errcode = 'P0001', message = 'A client name, email address and phone number are required.';
  end if;

  if v_input.package_id is not null then
    perform 1 from weave.packages where studio_id = p_studio_id and id = v_input.package_id for share;
    if not found then
      raise exception using errcode = 'P0001', message = 'The selected package is unavailable.';
    end if;
  end if;

  -- Reuse only one exact match. Several people with the same name do not
  -- identify a client, and a known email or phone is never overwritten.
  select case when count(*) = 1 then (array_agg(id))[1] else null end into v_client_id
  from weave.people where studio_id = p_studio_id and name = v_input.client_name;
  if v_client_id is null then
    insert into weave.people (studio_id, name, email, phone)
    values (p_studio_id, v_input.client_name, v_input.client_email, v_input.client_phone)
    returning id into v_client_id;
  else
    update weave.people
    set email = coalesce(nullif(email, ''), v_input.client_email),
        phone = coalesce(nullif(phone, ''), v_input.client_phone)
    where studio_id = p_studio_id and id = v_client_id and (coalesce(email, '') = '' or coalesce(phone, '') = '');
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
    jsonb_build_object('client', v_input.client_name, 'submission', v_submission));

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

revoke all on function weave.start_studio_booking(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function weave.start_studio_booking(uuid, uuid, uuid, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
