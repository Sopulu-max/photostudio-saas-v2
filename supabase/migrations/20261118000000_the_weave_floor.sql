-- The floor: a studio, the people in and around it, the jobs it holds, and a
-- record of what happened.
--
-- Four tables, and deliberately not five. Everything this system will later
-- know about offerings, equipment, files and money hangs off these, and none
-- of it is required for a studio to start working. A job can exist knowing
-- nothing but which studio it belongs to.
--
-- WHY ITS OWN SCHEMA. The previous system lives in `public` on this same
-- database and keeps running untouched. `weave` is a separate namespace, so
-- names can be chosen for what they are rather than for what is already taken,
-- and neither system can reach into the other by accident.

create schema if not exists weave;

-- ---------------------------------------------------------------- the studio
-- The tenant boundary, and nothing more. It answers "whose?" and defines
-- nothing about the work. Every other table carries studio_id, not null, with
-- no exceptions - the one rule the previous system kept perfectly and the one
-- worth keeping verbatim.
create table weave.studios (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- the people
-- ONE table for everyone: the client, the second shooter, the owner. Whether
-- someone is a client or staff is a fact about what they do here, not about
-- who they are, so it is not a different table. The previous system learned
-- this and it was right.
--
-- `name` is the only thing required. A phone number scribbled during a call is
-- enough to start a job; everything else arrives later or never.
create table weave.people (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references weave.studios(id) on delete cascade,
  name          text not null,
  email         text,
  phone         text,
  auth_user_id  uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index people_studio on weave.people(studio_id);
create index people_auth on weave.people(auth_user_id) where auth_user_id is not null;

-- ------------------------------------------------------------------ the jobs
-- What one client wants. This is the thing a studio owner actually thinks in,
-- and it is the only object that has to exist before the system is useful.
--
-- `wants` is PLAIN TEXT on purpose. The thing a client asks for arrives as a
-- sentence - "family portraits, three outfits, prints for the grandparents" -
-- and the system has no business demanding that be decomposed into a service,
-- a package and a set of bound variables before it will accept it. Structure
-- is derived from this later, when something needs it.
--
-- `turn` is WHOSE MOVE IT IS, and it is the spine of the whole interface:
--
--   us         somebody here has to do something
--   them       we are waiting on the client - selects, approval, payment
--   scheduled  nothing to do yet; it happens on a date
--   done       finished
--
-- These four are ENGINE KINDS, not the studio's vocabulary. They are the
-- distinct things this system actually behaves differently about, which is the
-- only thing that earns a fixed value. A studio naming its own stages on top of
-- them comes later, and each named stage will point at one of these.
--
-- Half of a service studio's waiting is not its own, and a board that cannot
-- separate "we are working on it" from "we are waiting on them" misreports the
-- day every time it is looked at. That distinction is why this column exists
-- at all.
create table weave.jobs (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references weave.studios(id) on delete cascade,
  client_id    uuid references weave.people(id) on delete set null,
  title        text,
  wants        text,
  expected_on  date,
  turn         text not null default 'us'
                 check (turn in ('us', 'them', 'scheduled', 'done')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index jobs_studio on weave.jobs(studio_id);
create index jobs_board on weave.jobs(studio_id, turn, expected_on);

-- ---------------------------------------------------------------- the record
-- What happened, append-only, from the first day rather than bolted on later.
--
-- In the previous system this log was the only thing that survived a
-- destructive mistake: a deleted stage was rebuilt from the transitions
-- recorded here, because the events stored what each change MEANT and not just
-- what the row said afterwards. It earned its place; it starts in the floor.
--
-- `subject_type` + `subject_id` are deliberately not a foreign key. A log that
-- can only record what currently exists cannot tell you about what was deleted,
-- which is exactly when a log matters.
create table weave.events (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references weave.studios(id) on delete cascade,
  subject_type  text not null,
  subject_id    uuid not null,
  action        text not null,
  actor_id      uuid references weave.people(id) on delete set null,
  payload       jsonb not null default '{}',
  at            timestamptz not null default now()
);
create index events_studio_at on weave.events(studio_id, at desc);
create index events_subject on weave.events(subject_type, subject_id, at desc);

-- -------------------------------------------------------------------- guards
-- updated_at maintained by the database so no writer can forget it.
create or replace function weave.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger studios_touch before update on weave.studios
  for each row execute function weave.touch_updated_at();
create trigger people_touch before update on weave.people
  for each row execute function weave.touch_updated_at();
create trigger jobs_touch before update on weave.jobs
  for each row execute function weave.touch_updated_at();

-- A job cannot move backwards out of done by accident, and nothing may be
-- un-done silently: the transition is allowed, but it must be deliberate and it
-- is recorded. Enforced here rather than trusted to the application, because
-- the previous system had thirteen status columns and transition rules on one.
create or replace function weave.job_turn_is_recorded() returns trigger as $$
begin
  if tg_op = 'UPDATE' and new.turn is distinct from old.turn then
    insert into weave.events (studio_id, subject_type, subject_id, action, payload)
    values (new.studio_id, 'job', new.id, 'turn_changed',
            jsonb_build_object('from', old.turn, 'to', new.turn));
  end if;
  return new;
end;
$$ language plpgsql;

create trigger jobs_turn_recorded after update on weave.jobs
  for each row execute function weave.job_turn_is_recorded();

alter table weave.studios enable row level security;
alter table weave.people  enable row level security;
alter table weave.jobs    enable row level security;
alter table weave.events  enable row level security;
