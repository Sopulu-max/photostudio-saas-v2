-- The invented service goes, and the offer built on it.
--
-- Building a package from a public enquiry used to CREATE A SERVICE named after
-- whatever the client had chosen. So an enquiry answering "Occasion: Maternity"
-- produced a service called `Maternity` — filed under Videography, because the
-- domain was taken from whichever copy of the dimension resolved first — with
-- no deliverable, no workflow and no variables. A classification value became a
-- capability, and an empty one.
--
-- It was never a decision. Portrait Photography already lists Maternity among
-- its occasions; the studio could always do this, and nothing needed inventing.
-- 02-ONTOLOGY says it plainly: booking facts are "what is true of this one
-- engagement. Never used to define the layers above." One stranger's enquiry
-- wrote itself into the catalogue.
--
-- The code no longer does this — resolution now chooses among capabilities that
-- already exist and assembles a package private to the booking. This removes
-- what the old behaviour left behind.
--
-- HARD DELETE, WHICH THIS APP OTHERWISE AVOIDS. Services and packages are
-- retired, never deleted, because they are deliberate records that other things
-- point at. These are neither: they are artifacts of a defect, and retiring
-- them would leave "Maternity" in the service list forever, greyed out,
-- inviting the question of what it was.
--
-- The dimension VALUE `Maternity` is untouched and must be — it is real studio
-- vocabulary, and Portrait Photography is classified by it.

do $$
declare
  svc uuid;
  pkgs uuid[];
  blocked integer;
  gone_packages integer;
  gone_services integer;
begin
  select s.id into svc
  from services s
  join organizations o on o.id = s.organization_id
  where o.name = 'Glamour Studio' and s.name = 'Maternity';

  if svc is null then
    raise notice 'Nothing to remove — the invented service is not here.';
    return;
  end if;

  select array_agg(p.id) into pkgs
  from packages p
  join organizations o on o.id = p.organization_id
  where o.name = 'Glamour Studio' and p.name = 'Custom: Maternity';

  /*
   * REFUSED IF ANYTHING REAL POINTS AT THEM.
   *
   * Every foreign key into packages and services, checked by name rather than
   * assumed empty: a booking line, a delivery container, or another package
   * claiming to be an instance of one of these would mean somebody has used it,
   * and a defect artifact somebody has used is no longer only an artifact.
   */
  select
    (select count(*) from booking_lines l where l.package_id = any(coalesce(pkgs, '{}')))
    + (select count(*) from package_delivery_containers c where c.package_id = any(coalesce(pkgs, '{}')))
    /*
     * A package claiming to be an instance of one of these — but not one that
     * is itself being removed. The orphaned copy the old flow left behind
     * points at the catalogue row it was copied from, and both are in this
     * set: counting that as an outside reference makes the pair permanently
     * undeletable by protecting each with the other.
     */
    + (select count(*) from packages p
         where p.instance_of = any(coalesce(pkgs, '{}'))
           and not (p.id = any(coalesce(pkgs, '{}'))))
    + (select count(*) from package_services ps
         where ps.service_id = svc and not (ps.package_id = any(coalesce(pkgs, '{}'))))
    + (select count(*) from service_deliverables d where d.service_id = svc)
    + (select count(*) from variables v where v.service_id = svc)
  into blocked;

  if blocked > 0 then
    raise exception
      'Refusing to remove the invented Maternity service: % reference(s) exist. Something has been built on it.',
      blocked;
  end if;

  -- Packages first: they hold the bundle rows that point at the service.
  with gone as (
    delete from packages where id = any(coalesce(pkgs, '{}')) returning 1
  ) select count(*) into gone_packages from gone;

  with gone as (
    delete from services where id = svc returning 1
  ) select count(*) into gone_services from gone;

  raise notice 'Removed % package(s) and % service(s).', gone_packages, gone_services;
end $$;

notify pgrst, 'reload schema';
