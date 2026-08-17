-- Two things a studio says about a person, when there was only ever one.
--
-- 1. SKILLS BECOME ROLES.
--
-- A person had `roles` (Photographer) and `skills` (Drone, Retouching) — two
-- vocabularies for "what this person can do", stored differently and answering
-- the same question. Only roles were wired to anything: a blueprint stage routes
-- to a role, so staffing consulted roles and ignored skills entirely. A studio
-- could record that John flies a drone and never be offered him for a drone
-- shoot, which is worse than not recording it, because it looks like it counts.
--
-- Skills were also a comma-split text array — no ids, so nothing could point at
-- one. Roles are rows. Making capability one vocabulary means blueprints can
-- route to "Drone" exactly as they route to "Photographer", and the studio
-- stops maintaining a list that does nothing.
--
-- 2. AN ASSIGNMENT MUST MEAN SOMETHING.
--
-- `assignments` carries a nullable task_id AND a nullable booking_id: a row is
-- either a person on a task, or a person on a booking IN A ROLE, which is what
-- lets tasks derive their owner without being assigned one by one.
--
-- But role_id was optional on the write path while the read path skips any row
-- without it (`if (!m.role_id) continue`). So a studio could add someone to a
-- booking, see them listed as crew, and watch every task fail to route — with
-- nothing anywhere explaining why. Three such rows exist. The constraint makes
-- the invariant the code already assumed unstateable in the first place.

-- ── 1. Skills → roles ───────────────────────────────────────────────────────

-- Every distinct skill becomes a role of that studio, unless it already has one
-- by that name. Case-insensitive: "drone" and "Drone" are one capability.
insert into roles (organization_id, name)
select distinct e.organization_id, trim(skill.value)
from employees e
cross join lateral jsonb_array_elements_text(e.skills) as skill(value)
where trim(skill.value) <> ''
  and not exists (
    select 1 from roles r
    where r.organization_id = e.organization_id
      and lower(r.name) = lower(trim(skill.value))
  );

-- And the person holds it.
insert into employee_roles (organization_id, employee_id, role_id)
select distinct e.organization_id, e.id, r.id
from employees e
cross join lateral jsonb_array_elements_text(e.skills) as skill(value)
join roles r
  on r.organization_id = e.organization_id
 and lower(r.name) = lower(trim(skill.value))
where trim(skill.value) <> ''
  and not exists (
    select 1 from employee_roles er
    where er.employee_id = e.id and er.role_id = r.id
  );

-- Refuse to drop the column while any skill is unaccounted for. The last
-- copy-then-delete on this project destroyed every output type because it
-- trusted that the copy had worked.
do $$
declare
    stranded integer;
begin
    select count(*) into stranded
    from employees e
    cross join lateral jsonb_array_elements_text(e.skills) as skill(value)
    where trim(skill.value) <> ''
      and not exists (
        select 1 from employee_roles er
        join roles r on r.id = er.role_id
        where er.employee_id = e.id and lower(r.name) = lower(trim(skill.value))
      );
    if stranded > 0 then
        raise exception 'Refusing to drop skills: % skill(s) did not become a role', stranded;
    end if;
end $$;

alter table employees drop column if exists skills;

-- ── 2. An assignment attaches to a task, or names a role ────────────────────

-- Booking-level rows with no role are inert by construction: every reader skips
-- them. Removing them is removing rows that never meant anything, and the
-- constraint below is what stops them being written again.
delete from assignments
where task_id is null
  and role_id is null;

alter table assignments drop constraint if exists assignments_mean_something;

alter table assignments add constraint assignments_mean_something
    check (task_id is not null or role_id is not null);
