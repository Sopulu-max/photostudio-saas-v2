-- A shared gallery link is not an identity model. Named participants make
-- invitations revocable and give public actions a reliable actor.
alter table weave.galleries
  drop constraint if exists galleries_access_code_matches_mode;
alter table weave.galleries
  drop constraint if exists galleries_access_mode_check;
alter table weave.galleries
  add constraint galleries_access_mode_check check (access_mode in ('link', 'code', 'invite')),
  add constraint galleries_access_code_matches_mode check (
    (access_mode in ('link', 'invite') and access_code_hash is null)
    or (access_mode = 'code' and access_code_hash is not null)
  );

-- A section can be open to every gallery visitor or deliberately limited to
-- one closed participant role. Link and code visitors have no role, so they
-- never receive role-limited media URLs.
alter table weave.gallery_sections
  add column audience_role text check (audience_role in ('main_client', 'guest', 'vendor'));

create table weave.gallery_participants (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references weave.studios(id) on delete cascade,
  gallery_id        uuid not null references weave.galleries(id) on delete cascade,
  person_id         uuid not null references weave.people(id) on delete cascade,
  role              text not null check (role in ('main_client', 'guest', 'vendor')),
  status            text not null default 'invited' check (status in ('invited', 'approved', 'revoked')),
  access_token_hash text not null unique,
  invited_at        timestamptz not null default now(),
  approved_at       timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (gallery_id, person_id)
);
create index gallery_participants_gallery on weave.gallery_participants(gallery_id, status);
create index gallery_participants_person on weave.gallery_participants(person_id, gallery_id);
create trigger gallery_participants_touch before update on weave.gallery_participants
  for each row execute function weave.touch_updated_at();

alter table weave.gallery_participants enable row level security;
grant all on weave.gallery_participants to anon, authenticated, service_role;

notify pgrst, 'reload schema';
