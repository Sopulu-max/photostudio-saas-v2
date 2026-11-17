-- A gallery: a named set of a job's files, shown to somebody outside.
--
-- CONTENTS ARE EXPLICIT, not derived from what the studio chose. Deriving them
-- would have been tidier and is wrong: unchoosing a frame would then silently
-- pull it out of a gallery a client is already looking at. A share is a promise
-- about a fixed set, so the set is stated.
--
-- The gallery is where the client stops being the person it is all for and
-- becomes an actor in the process: they open it, they favourite, and later they
-- order. Their favourites land in the SAME `choices` table the studio's selects
-- land in, because it is one act recorded against different people.

create table weave.galleries (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references weave.studios(id) on delete cascade,
  job_id        uuid references weave.jobs(id) on delete cascade,
  name          text not null,
  -- The share link. Opaque and long: a gallery is private work and a guessable
  -- address is the whole of the security.
  token         text not null unique default encode(gen_random_bytes(16), 'hex'),
  cover_file_id uuid references weave.files(id) on delete set null,
  -- Null until the studio actually shares it. A gallery being BUILT and a
  -- gallery being LIVE are different things and the client should not be able
  -- to open the first.
  shared_at     timestamptz,
  may_download  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index galleries_studio on weave.galleries(studio_id);
create index galleries_job on weave.galleries(job_id);

create table weave.gallery_files (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  gallery_id  uuid not null references weave.galleries(id) on delete cascade,
  file_id     uuid not null references weave.files(id) on delete cascade,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (gallery_id, file_id)
);
create index gallery_files_gallery on weave.gallery_files(gallery_id, position);

create trigger galleries_touch before update on weave.galleries
  for each row execute function weave.touch_updated_at();

alter table weave.galleries     enable row level security;
alter table weave.gallery_files enable row level security;

grant all on weave.galleries     to anon, authenticated, service_role;
grant all on weave.gallery_files to anon, authenticated, service_role;

notify pgrst, 'reload schema';
