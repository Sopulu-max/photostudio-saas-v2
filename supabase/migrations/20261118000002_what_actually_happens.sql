-- The things that actually happen, and who is on them.
--
-- A job is an agreement. It is not the thing that happens. A wedding is one
-- job and several occasions — the engagement shoot, the day itself, the album
-- review — each with its own date, its own people and its own outcome. The
-- previous system had one `scheduled_for` column on the booking and therefore
-- could not say any of that; the operational weight went into the booking
-- instead and grew to eight thousand lines.
--
-- WHAT THIS IS NOT. The system before last had `sessions`, with the kind of the
-- session hardcoded — studio, outdoor, event — and the occasion hardcoded too:
-- birthday, wedding. That is the flat list this project spent a year
-- dissolving, and none of it comes back. An occasion here carries the studio's
-- own words in `what` and no built-in types whatsoever. How occasions are
-- classified, when a studio wants that, comes from the studio's own vocabulary
-- like everything else.
--
-- NULLABLE job_id, deliberately. A test shoot, a maintenance afternoon, a day
-- the studio opens for walk-ins: things happen that are nobody's job, and a
-- system that refuses to record them is a system the studio keeps a second
-- diary alongside.

create table weave.occasions (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references weave.studios(id) on delete cascade,
  job_id       uuid references weave.jobs(id) on delete cascade,
  what         text,
  on_date      date not null,
  starts_at    time,
  ends_at      time,
  -- Set when it has actually taken place. NOT a status column: whether an
  -- occasion is upcoming, today, overdue or done is derived from this and the
  -- date, so there is no second place for that fact to drift to.
  happened_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index occasions_studio_date on weave.occasions(studio_id, on_date);
create index occasions_job on weave.occasions(job_id);

-- Who is on it.
--
-- One row per person per occasion. This is the grain at which a studio actually
-- commits somebody: "Chidi is on Saturday", not "Chidi is on the Okafor job".
-- When equipment arrives it takes the same shape against the same occasion,
-- because a thing being spoken for between two times is one idea, not two.
create table weave.crew (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references weave.studios(id) on delete cascade,
  occasion_id  uuid not null references weave.occasions(id) on delete cascade,
  person_id    uuid not null references weave.people(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (occasion_id, person_id)
);
create index crew_occasion on weave.crew(occasion_id);
create index crew_person on weave.crew(person_id);

create trigger occasions_touch before update on weave.occasions
  for each row execute function weave.touch_updated_at();

alter table weave.occasions enable row level security;
alter table weave.crew      enable row level security;

grant all on weave.occasions to anon, authenticated, service_role;
grant all on weave.crew      to anon, authenticated, service_role;

notify pgrst, 'reload schema';
