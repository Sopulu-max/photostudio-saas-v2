-- Until now every job began inside the studio: somebody pressed "Start a job".
-- A booking is the same thing arriving from the other direction — a person the
-- studio may not know yet, asking for work that does not exist yet.
--
-- A request is NOT a separate entity. It is a job nobody has agreed to. Giving
-- requests their own table would mean accepting one copies it into `jobs`, and
-- from that moment there are two records of the same piece of work, drifting.
-- So the request and the job are one row, and what differs is whether anyone
-- has answered it.
--
-- Derived, not stored, like every other state here:
--   accepted_at null, declined_at null  -> waiting for an answer
--   accepted_at set                     -> work the studio has taken on
--   declined_at set                     -> refused, and kept, because a studio
--                                          should be able to see what it turned
--                                          down and who it turned down
alter table weave.jobs
  add column if not exists accepted_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists declined_because text,
  add column if not exists requested_at timestamptz;

-- A job cannot be both taken and refused.
do $$ begin
  alter table weave.jobs add constraint jobs_answered_once
    check (accepted_at is null or declined_at is null);
exception when duplicate_object then null; end $$;

-- EVERY EXISTING JOB WAS MADE BY THE STUDIO, so every one of them is already
-- accepted. Without this they would all read as unanswered requests and drop
-- out of the board the moment the new reading ships. A fix is never
-- forward-only: the rows already written have to be brought with it.
update weave.jobs set accepted_at = created_at
  where accepted_at is null and declined_at is null;

create index if not exists jobs_awaiting_an_answer
  on weave.jobs (studio_id, requested_at desc)
  where accepted_at is null and declined_at is null;

-- A request needs somewhere to arrive. A slug is the studio's first address —
-- the thing a booking page hangs off today, and the subdomain it becomes later.
alter table weave.studios add column if not exists slug text;

create or replace function weave.slugify(value text) returns text
language sql immutable as $$
  select nullif(trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g')), '');
$$;

-- Backfill, then make it required and unique. In that order: adding a not-null
-- unique column to a table with rows in it fails otherwise.
update weave.studios
  set slug = coalesce(weave.slugify(name), 'studio-' || left(id::text, 8))
  where slug is null;

-- Two studios may genuinely share a name; the id suffix settles it.
update weave.studios s set slug = s.slug || '-' || left(s.id::text, 4)
  where exists (select 1 from weave.studios o where o.slug = s.slug and o.id <> s.id);

create unique index if not exists studios_slug_unique on weave.studios (slug);
alter table weave.studios alter column slug set not null;

-- Founding picks a free slug for the new studio, so a studio has a public
-- address from the moment it exists rather than from the moment somebody
-- remembers to set one.
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
  v_slug   text;
  v_try    text;
  v_n      integer := 1;
begin
  if p_auth_user_id is null then
    raise exception 'found_studio needs an account to attach the studio to';
  end if;
  if btrim(coalesce(p_studio_name, '')) = '' then
    raise exception 'A studio needs a name';
  end if;

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

  v_slug := coalesce(weave.slugify(p_studio_name), 'studio');
  v_try := v_slug;
  while exists (select 1 from weave.studios s where s.slug = v_try) loop
    v_n := v_n + 1;
    v_try := v_slug || '-' || v_n::text;
  end loop;

  insert into weave.studios (name, slug)
  values (btrim(p_studio_name), v_try)
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

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
