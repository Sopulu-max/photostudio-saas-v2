-- Gallery presentation is an explicit, bounded part of delivery. The choices
-- are names from the Lumen vocabulary rather than arbitrary CSS values, so a
-- gallery remains legible in both application themes and templates can reuse it.
alter table weave.galleries
  add column gallery_theme text not null default 'paper'
    check (gallery_theme in ('paper', 'midnight', 'cobalt', 'rose')),
  add column gallery_font text not null default 'modern'
    check (gallery_font in ('modern', 'editorial', 'mono')),
  add column gallery_grid text not null default 'story'
    check (gallery_grid in ('story', 'tiles', 'columns')),
  add column cover_style text not null default 'single'
    check (cover_style in ('single', 'split', 'filmstrip'));

alter table weave.gallery_templates
  add column gallery_theme text not null default 'paper'
    check (gallery_theme in ('paper', 'midnight', 'cobalt', 'rose')),
  add column gallery_font text not null default 'modern'
    check (gallery_font in ('modern', 'editorial', 'mono')),
  add column gallery_grid text not null default 'story'
    check (gallery_grid in ('story', 'tiles', 'columns')),
  add column cover_style text not null default 'single'
    check (cover_style in ('single', 'split', 'filmstrip'));

-- A hub is a deliberate request, not a copy of a collection: several named
-- collaborators may select and discuss the same delivery at once.
create table weave.gallery_hub_requests (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  gallery_id  uuid not null references weave.galleries(id) on delete cascade,
  title       text not null check (btrim(title) <> ''),
  purpose     text not null check (purpose in ('selection', 'album', 'retouch', 'approval')),
  min_items   integer check (min_items is null or min_items >= 0),
  max_items   integer check (max_items is null or max_items >= 1),
  due_on      date,
  status      text not null default 'open' check (status in ('open', 'closed')),
  created_by  uuid references weave.people(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (max_items is null or min_items is null or min_items <= max_items)
);
create index gallery_hub_requests_gallery on weave.gallery_hub_requests(gallery_id, created_at desc);
create trigger gallery_hub_requests_touch before update on weave.gallery_hub_requests
  for each row execute function weave.touch_updated_at();

create table weave.gallery_hub_members (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  request_id  uuid not null references weave.gallery_hub_requests(id) on delete cascade,
  person_id   uuid not null references weave.people(id) on delete cascade,
  submitted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (request_id, person_id)
);
create index gallery_hub_members_person on weave.gallery_hub_members(person_id, request_id);

create table weave.gallery_hub_selections (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  request_id  uuid not null references weave.gallery_hub_requests(id) on delete cascade,
  member_id   uuid not null references weave.gallery_hub_members(id) on delete cascade,
  file_id     uuid not null references weave.files(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (request_id, member_id, file_id)
);
create index gallery_hub_selections_request on weave.gallery_hub_selections(request_id, member_id);

create table weave.gallery_hub_references (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references weave.studios(id) on delete cascade,
  request_id   uuid not null references weave.gallery_hub_requests(id) on delete cascade,
  member_id    uuid not null references weave.gallery_hub_members(id) on delete cascade,
  storage_path text not null,
  name         text not null check (btrim(name) <> ''),
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);
create index gallery_hub_references_request on weave.gallery_hub_references(request_id, created_at);

create table weave.gallery_hub_messages (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references weave.studios(id) on delete cascade,
  request_id     uuid not null references weave.gallery_hub_requests(id) on delete cascade,
  member_id      uuid not null references weave.gallery_hub_members(id) on delete cascade,
  file_id        uuid references weave.files(id) on delete set null,
  parent_id      uuid references weave.gallery_hub_messages(id) on delete set null,
  pin_x          numeric(5,4) check (pin_x is null or (pin_x >= 0 and pin_x <= 1)),
  pin_y          numeric(5,4) check (pin_y is null or (pin_y >= 0 and pin_y <= 1)),
  body           text not null check (btrim(body) <> ''),
  created_at     timestamptz not null default now()
);
create index gallery_hub_messages_request on weave.gallery_hub_messages(request_id, created_at);

-- An album is a durable proof. Spreads are deliberately small records so a
-- photographer can build a sequence without depending on a proprietary editor.
create table weave.gallery_albums (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  gallery_id  uuid not null references weave.galleries(id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  status      text not null default 'draft' check (status in ('draft', 'review', 'approved')),
  created_by  uuid references weave.people(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index gallery_albums_gallery on weave.gallery_albums(gallery_id, created_at);
create trigger gallery_albums_touch before update on weave.gallery_albums
  for each row execute function weave.touch_updated_at();

create table weave.gallery_album_spreads (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references weave.studios(id) on delete cascade,
  album_id      uuid not null references weave.gallery_albums(id) on delete cascade,
  position      integer not null default 0,
  left_file_id  uuid references weave.files(id) on delete set null,
  right_file_id uuid references weave.files(id) on delete set null,
  caption       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (left_file_id is not null or right_file_id is not null),
  unique (album_id, position)
);
create index gallery_album_spreads_album on weave.gallery_album_spreads(album_id, position);
create trigger gallery_album_spreads_touch before update on weave.gallery_album_spreads
  for each row execute function weave.touch_updated_at();

create table weave.gallery_album_comments (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  album_id    uuid not null references weave.gallery_albums(id) on delete cascade,
  spread_id   uuid not null references weave.gallery_album_spreads(id) on delete cascade,
  person_id   uuid not null references weave.people(id) on delete cascade,
  parent_id   uuid references weave.gallery_album_comments(id) on delete set null,
  body        text not null check (btrim(body) <> ''),
  created_at  timestamptz not null default now()
);
create index gallery_album_comments_spread on weave.gallery_album_comments(spread_id, created_at);

alter table weave.gallery_hub_requests enable row level security;
alter table weave.gallery_hub_members enable row level security;
alter table weave.gallery_hub_selections enable row level security;
alter table weave.gallery_hub_references enable row level security;
alter table weave.gallery_hub_messages enable row level security;
alter table weave.gallery_albums enable row level security;
alter table weave.gallery_album_spreads enable row level security;
alter table weave.gallery_album_comments enable row level security;
grant all on weave.gallery_hub_requests, weave.gallery_hub_members, weave.gallery_hub_selections,
  weave.gallery_hub_references, weave.gallery_hub_messages, weave.gallery_albums,
  weave.gallery_album_spreads, weave.gallery_album_comments to anon, authenticated, service_role;

notify pgrst, 'reload schema';
