-- A favourite is one person's yes/no reaction to one picture. A collection is
-- a named, gallery-specific set that can carry a selection brief and be
-- explicitly submitted. They are different facts and must not overload a flag.
create table weave.gallery_collections (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references weave.studios(id) on delete cascade,
  gallery_id   uuid not null references weave.galleries(id) on delete cascade,
  person_id    uuid not null references weave.people(id) on delete cascade,
  name         text not null check (btrim(name) <> ''),
  kind         text not null default 'collection' check (kind in ('collection', 'selection')),
  max_items    integer check (max_items is null or max_items > 0),
  due_on       date,
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (
    (kind = 'collection' and max_items is null)
    or (kind = 'selection' and max_items is not null)
  ),
  unique (gallery_id, id)
);
create index gallery_collections_gallery on weave.gallery_collections(gallery_id, created_at);
create index gallery_collections_person on weave.gallery_collections(person_id, created_at);

create trigger gallery_collections_touch before update on weave.gallery_collections
  for each row execute function weave.touch_updated_at();

create table weave.gallery_collection_files (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references weave.studios(id) on delete cascade,
  gallery_id    uuid not null,
  collection_id uuid not null,
  file_id       uuid not null,
  created_at    timestamptz not null default now(),
  unique (collection_id, file_id),
  foreign key (gallery_id, collection_id)
    references weave.gallery_collections(gallery_id, id) on delete cascade,
  foreign key (gallery_id, file_id)
    references weave.gallery_files(gallery_id, file_id) on delete cascade
);
create index gallery_collection_files_collection on weave.gallery_collection_files(collection_id, created_at);

alter table weave.gallery_collections enable row level security;
alter table weave.gallery_collection_files enable row level security;
grant all on weave.gallery_collections to anon, authenticated, service_role;
grant all on weave.gallery_collection_files to anon, authenticated, service_role;

notify pgrst, 'reload schema';
