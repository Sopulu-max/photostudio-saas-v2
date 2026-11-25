-- `weave.team()` reads whoever has a `joined_at`, which is the right rule: a
-- person row is a client as readily as an operator, and "works here" has to
-- be a fact somebody recorded rather than a guess from having an email.
--
-- But `found_studio` never set it. So the one person guaranteed to work at a
-- studio — the person who founded it — was not on its team. A studio that
-- signed up this morning opened /team and read "No team members", and could
-- not put themselves on a shoot, because crew is drawn from the team and
-- nothing else.
--
-- WHAT THIS TOUCHES. `weave.people.joined_at` gains a value it should always
-- have had for founders. That is read by `team()`, by the crew picker on an
-- occasion, and now by the Team tile on the home page. Nothing else changes:
-- the column already existed and already allowed null, because a client has
-- no joining date and never will.
create or replace function weave.found_studio(
  p_auth_user_id uuid,
  p_email        text,
  p_studio_name  text,
  p_person_name  text
) returns table (studio_id uuid, person_id uuid)
language plpgsql
security definer
set search_path = weave, public
as $$
declare
  v_studio uuid;
  v_person uuid;
begin
  if p_auth_user_id is null then
    raise exception 'found_studio needs an account to attach the studio to';
  end if;
  if btrim(coalesce(p_studio_name, '')) = '' then
    raise exception 'A studio needs a name';
  end if;

  -- Already founded, or already a member: say so and change nothing.
  select p.studio_id, p.id into v_studio, v_person
  from weave.people p
  where p.auth_user_id = p_auth_user_id
  order by p.created_at
  limit 1;

  if v_studio is not null then
    studio_id := v_studio;
    person_id := v_person;
    return next;
    return;
  end if;

  insert into weave.studios (name)
  values (btrim(p_studio_name))
  returning id into v_studio;

  -- joined_at, because founding a studio is the most certain way there is of
  -- working at one.
  insert into weave.people (studio_id, name, email, auth_user_id, joined_at)
  values (
    v_studio,
    coalesce(nullif(btrim(p_person_name), ''), btrim(p_studio_name)),
    lower(btrim(p_email)),
    p_auth_user_id,
    now()
  )
  returning id into v_person;

  studio_id := v_studio;
  person_id := v_person;
  return next;
end $$;

revoke all on function weave.found_studio(uuid, text, text, text) from public, anon;
grant execute on function weave.found_studio(uuid, text, text, text) to service_role;

-- FORWARD-ONLY IS NOT A FIX. Every studio founded before this ran has an
-- owner missing from its own team, and changing the function does nothing for
-- them. Backfilled to when the row was made, which is when they joined.
--
-- Scoped to operators: a person with no account is a client, and giving them
-- a joining date would put a studio's clients on its team — the same mistake
-- that email-matching made in `whoIsAsking`.
update weave.people
set joined_at = created_at
where auth_user_id is not null
  and joined_at is null;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
