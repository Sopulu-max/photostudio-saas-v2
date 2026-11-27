-- Invoice forms supply financial terms. The line item is the booked package,
-- then the occasion if there is no package. Keep it as issued on the invoice.
-- Retain the RPC signature for compatibility with the booking transaction;
-- p_description no longer controls the line item.
begin;

create or replace function weave.issue_booking_invoice(
  p_studio_id uuid, p_booking_id uuid, p_actor_id uuid, p_description text,
  p_currency text, p_total_minor bigint, p_deposit_minor bigint, p_instructions text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
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
  select p.name, b.package_id, b.occasion into v_client_name, v_package_id, v_occasion
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
  -- Compare to the amount shown at confirmation. A price change in another
  -- tab must be reviewed, and an edited form must not override the package.
  if v_package_price is not null and (
    v_package_price is distinct from p_total_minor or v_package_currency is distinct from p_currency
  ) then
    raise exception using errcode = 'P0001', message = 'Invoice amount and currency must match the package price. Reload the booking.';
  end if;

  select coalesce(max(number), 0) + 1 into v_number
  from weave.booking_invoices where studio_id = p_studio_id;

  insert into weave.booking_invoices (
    studio_id, booking_id, number, client_name, description, currency, total_minor, deposit_minor, instructions
  ) values (
    p_studio_id, p_booking_id, v_number, v_client_name,
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

notify pgrst, 'reload schema';
commit;
