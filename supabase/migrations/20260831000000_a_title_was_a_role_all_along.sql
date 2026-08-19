-- Title goes. A role is the only answer to "what does this person do".
--
-- WHY IT WAS WRONG TO HAVE BOTH. A role is structural: a blueprint stage names
-- one, a task carries it as `suggested_role_id`, and task owners are derived by
-- matching that against the roles the booking's crew hold. Take roles away and
-- staffing stops. `employees.title` was read by nothing — a profile subtitle, a
-- column in the list, a fallback label on the attendance board. Two fields that
-- rendered as plain text beside a person's name, one of which routed work and
-- one of which did not, with nothing on screen saying which was which.
--
-- THE DATA SETTLED IT. Every employee had a title, and the four distinct values
-- were Configurator, Editor, Receptionist and Manager — role names, every one.
-- Three of them already existed as actual roles in the same studio that had
-- them as titles. Studios were not describing people; they were naming the work
-- twice and only one of the two staffed anything.
--
-- SO THIS CONVERTS RATHER THAN DROPS. A bare DROP COLUMN would delete a real
-- statement about nine people. Each title becomes a role the studio owns and is
-- assigned to whoever held it, which lands the information in the field that
-- was always meant to carry it. Matching is case-insensitive so an existing
-- "Editor" role absorbs the "editor" title instead of standing beside it.

-- 1. A role for every title that has no role by that name yet.
--    Grouped by lower(name) so two titles differing only in case cannot both
--    insert and collide on unique (organization_id, name).
insert into roles (organization_id, name)
select t.organization_id, min(t.title_clean) as name
from (
    select organization_id, btrim(title) as title_clean
    from employees
    where title is not null and btrim(title) <> ''
) t
where not exists (
    select 1 from roles r
    where r.organization_id = t.organization_id
      and lower(r.name) = lower(t.title_clean)
)
group by t.organization_id, lower(t.title_clean);

-- 2. Hand each person the role their title named. Anyone who already holds it
--    is left alone — the unique (employee_id, role_id) says so.
insert into employee_roles (organization_id, employee_id, role_id)
select e.organization_id, e.id, r.id
from employees e
join roles r
  on r.organization_id = e.organization_id
 and lower(r.name) = lower(btrim(e.title))
where e.title is not null and btrim(e.title) <> ''
on conflict (employee_id, role_id) do nothing;

-- 3. The column has said everything it has to say.
alter table employees drop column if exists title;
