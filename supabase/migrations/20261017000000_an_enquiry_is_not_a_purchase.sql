-- An enquiry is not a purchase.
--
-- A booking line is the claim that a specific package was taken on. A custom
-- enquiry from the public page makes no such claim: the client described what
-- they wanted in their own words and asked the studio to work out the rest.
-- Intake nonetheless wrote a line for every one of them — package_id NULL,
-- title 'Custom Enquiry', price '{}' — asserting a fact that did not exist.
--
-- WHAT THAT COST. Everything this app knows how to do with a booking hangs off
-- the package its line points at: services, classifications, variables,
-- deliverables, price, the work. A line pointing at nothing rendered as a card
-- reading "Services: None" and carrying none of it. And because the booking
-- then had a line, it was never in the "nothing on this booking yet" state —
-- which is the only place the control for building a package out of an enquiry
-- was rendered. The bridge from a custom enquiry into the rest of the app
-- existed and was unreachable for exactly the bookings it was built for.
--
-- Intake no longer writes these. This removes the ones already written.
--
-- NOTHING IS LOST. What the client said lives in metadata.form_responses, which
-- is where an enquiry belongs until the studio decides what it is; the booking
-- page reads it back as booking form answers, and now also offers to build a
-- service and package from the answers.

do $$
declare
  encumbered integer;
  removed integer;
begin
  /*
   * A stub is a line with no package, nothing priced and nothing hanging off
   * it. Anything else that happens to have no package is somebody's real work
   * — a line added by hand and not yet pointed at a package, say — and this
   * refuses rather than deciding on their behalf.
   *
   * Every foreign key into booking_lines is checked by name rather than trusted
   * to be empty: booking_tasks, invoice_lines, assignments, assets and
   * booking_line_variable_values.
   */
  select count(*) into encumbered
  from booking_lines l
  where l.package_id is null
    and l.title = 'Custom Enquiry'
    and (
      coalesce(l.price, '{}'::jsonb) <> '{}'::jsonb
      or exists (select 1 from booking_line_variable_values v where v.booking_line_id = l.id)
      or exists (select 1 from booking_tasks t where t.booking_line_id = l.id)
      or exists (select 1 from invoice_lines i where i.booking_line_id = l.id)
      or exists (select 1 from assignments a where a.booking_line_id = l.id)
      or exists (select 1 from assets a where a.produced_by_line_id = l.id)
    );

  if encumbered > 0 then
    raise exception
      'Refusing to remove enquiry stub lines: % of them carry a price, work, an invoice, an assignment or a file. Deal with those first.',
      encumbered;
  end if;

  with gone as (
    delete from booking_lines l
    where l.package_id is null
      and l.title = 'Custom Enquiry'
      and coalesce(l.price, '{}'::jsonb) = '{}'::jsonb
    returning 1
  )
  select count(*) into removed from gone;

  raise notice 'Removed % enquiry stub line(s).', removed;
end $$;

notify pgrst, 'reload schema';
