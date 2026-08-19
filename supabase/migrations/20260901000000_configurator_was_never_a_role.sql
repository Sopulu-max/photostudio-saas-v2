-- Configurator is not work anyone does.
--
-- WHERE IT CAME FROM. The old schema had a `persons` table with a `role`
-- column holding an access tier: configurator, operator, freelancer, client.
-- Configurator meant the studio owner — full read/write on everything — and
-- was a permission level, never a job. When persons was split into clients and
-- employees, the backfill wrote `initcap(p.role)` into `employees.title`, and a
-- permission tier became the string "Configurator" sitting where a job title
-- goes. Nobody typed it. That is why it appeared, identically, in four
-- unrelated studios.
--
-- It then rode one more step: dropping `title` converted every title into a
-- role, because the values studios had actually typed — Editor, Receptionist,
-- Manager — were role names. This one was not, and it came along.
--
-- WHY IT HAS TO GO. A role is what production routes to: a blueprint stage
-- names one, a task carries it as suggested_role_id, and task owners are
-- derived by matching it against the crew's roles. Owning the studio is not a
-- stage anyone gets staffed to. Left in place it is a permanent option in every
-- role picker that can never correctly be chosen.
--
-- The owner is not being forgotten. They are known by their contact carrying
-- auth_user_id, which is where that fact belongs — three of the four holders
-- are exactly that, and afterwards they simply hold no production role, which
-- is true. The fourth also holds Drone and Retouching and keeps both.
--
-- GUARDED, NOT BLANKET. Only a Configurator role that nothing routes to is
-- removed. If any studio has somehow attached real work to it, that work wins
-- and the role stays — a cleanup that can delete live routing is not a cleanup.
-- Narrowed to this one word: Operator and Freelancer came from the same dead
-- enum, but a studio could plausibly name a real role Operator, and none exist
-- today, so nothing is guessed on their behalf.

delete from employee_roles er
using roles r
where er.role_id = r.id
  and lower(r.name) = 'configurator'
  and not exists (select 1 from assignments a where a.role_id = r.id)
  and not exists (select 1 from tasks t where t.suggested_role_id = r.id);

delete from roles r
where lower(r.name) = 'configurator'
  and not exists (select 1 from assignments a where a.role_id = r.id)
  and not exists (select 1 from tasks t where t.suggested_role_id = r.id);
