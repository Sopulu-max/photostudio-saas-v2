-- Currency belongs to the studio, and dead columns go.
--
-- 1. A studio bills in one currency. It was hardcoded to 'USD' in the service
--    domain and the form, and repeated on every service — so a studio billing
--    in Naira could not. Currency spans Services, Contracts and Finances, so it
--    is genuinely studio-wide: it lives on the organization, read by all three.
--
-- 2. Four service columns were empty on every row — structure with no
--    capability. `media` and `resource_requirements` are leftovers of the page
--    builder and the Scheduling module we dropped; role_requirements and
--    deliverable_spec were never built. They come back with the features that
--    need them, not before. (form_schema stays — the intake builder uses it.)

alter table organizations add column currency text not null default 'USD';

-- Adopt whatever the studio's existing services already priced in.
update organizations o
set currency = sub.currency
from (
  select organization_id, (pricing->>'currency') as currency
  from services
  where pricing->>'currency' is not null
  group by organization_id, (pricing->>'currency')
) sub
where sub.organization_id = o.id;

alter table services drop column if exists resource_requirements;
alter table services drop column if exists role_requirements;
alter table services drop column if exists deliverable_spec;
alter table services drop column if exists media;
