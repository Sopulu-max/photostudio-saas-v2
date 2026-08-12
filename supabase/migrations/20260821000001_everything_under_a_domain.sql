-- The domain is the boundary. Nothing below it floats free of one.
--
-- The previous migration made a dimension's service_domain_id nullable, with
-- null meaning "studio-wide". That was mine, not the design, and it quietly
-- undid the point: if Client can be studio-wide, a studio is no longer
-- declaring what it does domain by domain — it's back to one flat vocabulary
-- with a domain column attached to some of it.
--
-- Scoping everything to a domain is what lets a studio say exactly which
-- domains it operates in. Photography's contexts are In-studio and Outdoor;
-- Printing's are nothing of the sort. They are not the same list with a filter
-- — they are different lists, and a studio that adds Printing next year starts
-- it clean rather than inheriting photography's vocabulary.
--
-- Values that share a name across domains are genuinely different rows. Person
-- as a Photography subject and Person as a Videography subject look identical
-- and are not the same fact: renaming or retiring one must not touch the other.

-- 1. The five, per domain rather than per studio.
insert into dimensions (organization_id, service_domain_id, name, question, example, position)
select sd.organization_id, sd.id, d.name, d.question, d.example, d.position
from service_domains sd
cross join (values
    ('Subject',  'What is being photographed?',        'Person, Product, Building', 0),
    ('Occasion', 'What occasion is it for?',           'Wedding, Birthday',         1),
    ('Context',  'Where, and under what conditions?',  'Studio, Outdoor',           2),
    ('Purpose',  'What is it for?',                    'Passport, Advertising',     3),
    ('Client',   'Who is the client?',                 'Individual, Corporate',     4)
) as d(name, question, example, position)
on conflict do nothing;

-- Carry each studio's on/off choices onto every one of its domains.
update dimensions dom
set is_active = src.is_active
from dimensions src
where src.service_domain_id is null
  and dom.service_domain_id is not null
  and dom.organization_id = src.organization_id
  and dom.name = src.name;

-- 2. Every value the studio had becomes that value *in each domain*.
insert into dimension_values (organization_id, dimension_id, name, position)
select v.organization_id, dom.id, v.name, v.position
from dimension_values v
join dimensions src on src.id = v.dimension_id and src.service_domain_id is null
join dimensions dom on dom.organization_id = src.organization_id
                   and dom.name = src.name
                   and dom.service_domain_id is not null
on conflict do nothing;

-- 3. Re-point what services are tagged as, to the value row under their own
--    domain. A service already knows its domain, so there is no guessing.
insert into service_dimension_values (organization_id, service_id, dimension_value_id)
select sdv.organization_id, sdv.service_id, target.id
from service_dimension_values sdv
join dimension_values old_v on old_v.id = sdv.dimension_value_id
join dimensions old_d on old_d.id = old_v.dimension_id and old_d.service_domain_id is null
join services s on s.id = sdv.service_id
join dimensions target_d on target_d.organization_id = sdv.organization_id
                        and target_d.service_domain_id = s.service_domain_id
                        and target_d.name = old_d.name
join dimension_values target on target.dimension_id = target_d.id
                            and lower(target.name) = lower(old_v.name)
on conflict do nothing;

-- 4. The same for packages, using the domain of a service the package bundles.
--    A package spanning two domains keeps the tag under each of them, which is
--    honest: a Wedding package that is both Photography and Videography really
--    is a wedding in both.
insert into package_dimension_values (organization_id, package_id, dimension_value_id)
select distinct pdv.organization_id, pdv.package_id, target.id
from package_dimension_values pdv
join dimension_values old_v on old_v.id = pdv.dimension_value_id
join dimensions old_d on old_d.id = old_v.dimension_id and old_d.service_domain_id is null
join package_services ps on ps.package_id = pdv.package_id
join services s on s.id = ps.service_id
join dimensions target_d on target_d.organization_id = pdv.organization_id
                        and target_d.service_domain_id = s.service_domain_id
                        and target_d.name = old_d.name
join dimension_values target on target.dimension_id = target_d.id
                            and lower(target.name) = lower(old_v.name)
on conflict do nothing;

-- 5. The studio-wide rows have nothing left to say. Their tags cascade away
--    with them, which is why the re-pointing above had to happen first.
delete from dimensions where service_domain_id is null;

-- 6. And now it cannot happen again.
alter table dimensions
    alter column service_domain_id set not null;

-- The unique index still coalesces a null that can no longer exist; replace it
-- with one that says what is actually true.
drop index if exists dimensions_unique_name;
create unique index if not exists dimensions_unique_name
    on dimensions(service_domain_id, lower(name));
