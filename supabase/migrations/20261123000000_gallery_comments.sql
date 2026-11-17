-- A client's note is evidence about one picture in one gallery. It is not a
-- mutable caption: preserving the original words matters once a selection or
-- album decision is being discussed.
create table weave.gallery_comments (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  gallery_id  uuid not null,
  file_id     uuid not null,
  person_id   uuid not null references weave.people(id) on delete cascade,
  body        text not null check (btrim(body) <> ''),
  created_at  timestamptz not null default now(),
  foreign key (gallery_id, file_id)
    references weave.gallery_files(gallery_id, file_id) on delete cascade
);
create index gallery_comments_gallery on weave.gallery_comments(gallery_id, created_at desc);
create index gallery_comments_file on weave.gallery_comments(file_id, created_at desc);

alter table weave.gallery_comments enable row level security;
grant all on weave.gallery_comments to anon, authenticated, service_role;

notify pgrst, 'reload schema';
