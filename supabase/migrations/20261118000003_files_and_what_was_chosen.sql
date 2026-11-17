-- Files, and what somebody chose.
--
-- This is the operational core and it goes in before anything that depends on
-- it. The previous system had a well-shaped assets table with a lineage column
-- and ZERO rows in it, because nothing ever ingested — delivery was built as
-- the end of a pipeline that had no beginning. Galleries, favourites, a print
-- store and an album all stand on this table and none of them can be built
-- first.
--
-- A FILE BELONGS TO A JOB, not to a booking line or an invoice. In the day it
-- arrives, what is known about a card full of images is which job it is for;
-- nothing commercial has necessarily happened yet, and the system should not
-- require that it has.
--
-- NO STATE COLUMN. Whether a file is a raw, an edit, a select or a delivered
-- thing is not a word to be stored — it is derivable. An edit knows its
-- original through `derived_from`; what was chosen lives in its own table,
-- because a choice is somebody's act and has to carry whose.

create table weave.files (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references weave.studios(id) on delete cascade,
  job_id        uuid not null references weave.jobs(id) on delete cascade,
  -- Which day's work it came off, when that is known. A studio shooting a
  -- wedding over three occasions needs to tell the three apart.
  occasion_id   uuid references weave.occasions(id) on delete set null,
  -- An edit knows its original. This is what lets the system say "these forty
  -- are retouched versions of those forty" without anybody labelling them.
  derived_from  uuid references weave.files(id) on delete set null,
  storage_path  text not null,
  name          text not null,
  mime_type     text,
  size_bytes    bigint,
  added_by      uuid references weave.people(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (studio_id, storage_path)
);
create index files_job on weave.files(job_id, created_at);
create index files_occasion on weave.files(occasion_id);
create index files_derived on weave.files(derived_from);

-- WHAT SOMEBODY CHOSE.
--
-- A studio picking selects and a client picking favourites are the SAME ACT
-- recorded by different people, so they are one table and not two. That is
-- also the first time in this system that the client appears as an actor
-- inside the process rather than only as the person it is all for — the line
-- of visibility, which the research register ranked seventh and nothing ever
-- built.
create table weave.choices (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  file_id     uuid not null references weave.files(id) on delete cascade,
  person_id   uuid not null references weave.people(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (file_id, person_id)
);
create index choices_file on weave.choices(file_id);
create index choices_person on weave.choices(person_id);

alter table weave.files   enable row level security;
alter table weave.choices enable row level security;

grant all on weave.files   to anon, authenticated, service_role;
grant all on weave.choices to anon, authenticated, service_role;

-- A private bucket of its own. Private because a studio's work is not public
-- until the studio says so; everything is read through short-lived signed URLs
-- issued per request, so nothing is reachable by guessing a path.
insert into storage.buckets (id, name, public)
select 'weave-files', 'weave-files', false
where not exists (select 1 from storage.buckets where id = 'weave-files');

notify pgrst, 'reload schema';
