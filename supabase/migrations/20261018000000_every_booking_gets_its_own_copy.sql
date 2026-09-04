-- Every booking gets its own copy, including the ones already recorded.
--
-- A booking line is meant to point at a private copy of a package, so the
-- studio can go on editing its catalogue without rewriting what a client was
-- already quoted. That rule lived inside the new-booking form, so only bookings
-- made on that screen obeyed it; it was written again in the public booking
-- path; and addBookingLine — the ordinary way to correct a booking afterwards,
-- and the only way the edit page offered — obeyed neither.
--
-- The code fix puts the rule in Packages where every caller reaches it. This is
-- the other half: the rows already written under the old behaviour. Without it
-- the fix only protects bookings taken from now on, and an operator opening an
-- older one is told their booking points at the catalogue and asked to press a
-- button — which is a repair, and repairs belong here rather than in front of
-- somebody trying to work.
--
-- WHAT A COPY COSTS, AND WHY IT IS SAFE HERE. Instancing freezes list_price, so
-- the discount on a booking stays derived against what the package listed at
-- rather than drifting every time the catalogue price moves. Frozen NOW, which
-- would misstate the discount on a booking taken when the catalogue said
-- something else. So this refuses to touch any line that has been billed or
-- contracted, where such a figure could be contradicted by a document already
-- in a client's hands. Those are left for a person to decide about, and the
-- edit page still offers the copy one at a time.
--
-- THIS MIGRATION DOES NOT DO THE COPYING, ON PURPOSE.
--
-- A package is a graph — bundled services, promised deliverables, narrowed
-- classifications, variable values, tasks — and the application already has
-- exactly one copier for it. Reimplementing that in SQL would be a second
-- copier that silently stops matching the first the next time a package grows
-- a table, and this codebase has paid for that shape of duplication more than
-- once already.
--
-- So this reports what still needs repairing, and the repair itself goes
-- through the one copier: Bookings' giveLineItsOwnPackage, which the booking's
-- edit page offers on any line still pointing at the catalogue.

do $$
declare
  pending integer;
  billed integer;
begin
  select count(*) into pending
  from booking_lines l
  join packages p on p.id = l.package_id
  where p.instance_of is null
    and p.status <> 'custom';

  select count(*) into billed
  from booking_lines l
  join packages p on p.id = l.package_id
  where p.instance_of is null
    and p.status <> 'custom'
    and (
      exists (select 1 from invoice_lines il where il.booking_line_id = l.id)
      or exists (select 1 from contracts c where c.booking_id = l.booking_id)
    );

  raise notice
    'Booking lines still pointing at a catalogue package: %. Of those, % have been billed or contracted and are left alone.',
    pending, billed;

  if pending > 0 then
    raise notice
      'Repair each from its booking''s edit page — "Give this booking its own copy".';
  end if;
end $$;

/*
 * And an index for the question both the backfill and the edit page ask:
 * "is this line pointing at something private?". Partial, because the rows that
 * matter are the exception rather than the rule.
 */
create index if not exists packages_catalogue_rows
  on packages (organization_id, id)
  where instance_of is null and status <> 'custom';

notify pgrst, 'reload schema';
