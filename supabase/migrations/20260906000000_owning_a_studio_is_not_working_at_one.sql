-- Owners were made staff without being asked.
--
-- Signing up created an employee record for the person creating the studio, so
-- the owner appeared on the attendance register waiting to check in, in the
-- staffing pickers, and in every count of who works here. None of it was asked
-- for and none of it was needed: identity runs through contacts.auth_user_id,
-- and nothing in the app looks up an employee by the signed-in user.
--
-- NOT A BLANKET DELETE, because the assumption is wrong in only one direction.
-- A solo photographer who owns the studio and shoots it IS staff — the fault
-- was forcing it, never allowing it. So this removes an owner's employee record
-- only where nothing suggests they work there: no role, no attendance, no
-- assignment. An owner with any of those is someone doing the work, and their
-- record is theirs.
--
-- The rows this leaves behind are the honest ones. An owner who is also staff
-- keeps their place; an owner who never was stops being counted as one, and
-- can add themselves on the Team page the moment that changes.

delete from employees e
using contacts c
where c.id = e.contact_id
  and c.auth_user_id is not null
  and not exists (select 1 from employee_roles r where r.employee_id = e.id)
  and not exists (select 1 from attendance a where a.employee_id = e.id)
  and not exists (select 1 from assignments s where s.employee_id = e.id);
