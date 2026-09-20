-- A line is a package instance, or a charge. Nothing else.
--
-- For a week (20261102) a booking line could also point at a bare service
-- or deliverable, with a title and price of its own - an "extra". That
-- reinstated the untyped line retired on 5 Aug (20260805000001): a service
-- taken that way produced no work, because only package lines are worked
-- and staffed; a deliverable taken that way was a promise through no
-- service (20260909 re-keyed promises onto the bundle row for that reason),
-- and delivery grew a second reader of what was promised. Retracted before
-- any such line was written; the guard below proves it.
--
-- An extra is an edit of the booking's instance - a service added to its
-- bundle, a promise raised, a variable answered - with the price on the
-- instance, where list_price and price already hold what was listed and
-- what was agreed. A charge (travel, an extra hour) is a number with a
-- name and no work behind it; it keeps its title and price on the line,
-- which is why 20260920000002 - written to drop them - is retired unapplied.

do $$
declare stray int;
begin
  select count(*) into stray from booking_lines
   where target_type <> 'package' or target_service_id is not null or target_deliverable_id is not null;
  if stray > 0 then
    raise exception 'Refusing: % booking line(s) point at a service or deliverable directly', stray;
  end if;
end $$;

alter table booking_lines
  drop column if exists target_type,
  drop column if exists target_deliverable_id,
  drop column if exists target_deliverable_quantity,
  drop column if exists target_service_id;

comment on column booking_lines.package_id is
  'The booking''s own instance of a package. Null only for a charge - a named amount with no work behind it.';
