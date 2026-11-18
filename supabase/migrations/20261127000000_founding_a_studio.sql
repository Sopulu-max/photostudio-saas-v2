-- Founding a studio is three writes that must be one act: a studio exists, a
-- person exists inside it, and that person is the signed-in account. Two of
-- those three leaves an account that can authenticate and can never load a
-- page — signed in, belonging nowhere, redirected back to the login screen it
-- just came from. PostgREST cannot wrap two inserts in a transaction, so the
-- transaction lives here.
--
-- Idempotent on purpose. It is called after sign-up AND again from the auth
-- callback, because whether a session comes back from signUp depends on
-- whether the project demands email confirmation, and the app should not have
-- an opinion about which is switched on. Called twice, the second call returns
-- what the first one made.
--
-- WHAT IT DELIBERATELY DOES NOT DO: claim an existing person row that happens
-- to share the email. `weave.people` holds a studio's CLIENTS as well as its
-- operators — every gallery visitor becomes a row — so matching on email would
-- mean anyone could register as a photographer's client and be handed operator
-- access to that photographer's studio. Signing up always founds a new studio.
-- Joining an existing one needs an invitation the studio actually issued, and
-- that is a separate act with a token behind it.
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

  insert into weave.people (studio_id, name, email, auth_user_id)
  values (
    v_studio,
    coalesce(nullif(btrim(p_person_name), ''), btrim(p_studio_name)),
    lower(btrim(p_email)),
    p_auth_user_id
  )
  returning id into v_person;

  studio_id := v_studio;
  person_id := v_person;
  return next;
end $$;

revoke all on function weave.found_studio(uuid, text, text, text) from public, anon;
grant execute on function weave.found_studio(uuid, text, text, text) to service_role;

-- One account is one person per studio. Scoped to the studio rather than to
-- the account alone, because a photographer who second-shoots for two studios
-- is one account with two memberships, and forbidding that here would be
-- deciding it by accident.
create unique index if not exists people_one_account_per_studio
  on weave.people (auth_user_id, studio_id)
  where auth_user_id is not null;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
