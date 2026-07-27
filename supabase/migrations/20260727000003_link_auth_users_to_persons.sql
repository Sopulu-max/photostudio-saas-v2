-- Link auth users to their person records.
--
-- Operator actions must attribute events to a person (events.actor_id references
-- persons(id)), but the logged-in configurators' person rows had auth_user_id
-- null — so there was no way to resolve "which person is acting". Backfill the
-- link by matching a configurator person to the auth user with the same email.
update persons p
set auth_user_id = u.id
from auth.users u
where p.auth_user_id is null
  and p.role = 'configurator'
  and lower(p.email) = lower(u.email);
