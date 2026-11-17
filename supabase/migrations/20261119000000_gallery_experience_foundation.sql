-- A gallery is not one undifferentiated wall of files. The studio composes a
-- sequence of named sections, and each one may be kept out of the client view
-- while the gallery is still being prepared.
create table weave.gallery_sections (
  id                 uuid primary key default gen_random_uuid(),
  studio_id          uuid not null references weave.studios(id) on delete cascade,
  gallery_id         uuid not null references weave.galleries(id) on delete cascade,
  name               text not null check (btrim(name) <> ''),
  position           integer not null default 0,
  visible_to_clients boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index gallery_sections_gallery on weave.gallery_sections(gallery_id, position);
alter table weave.gallery_sections
  add constraint gallery_sections_gallery_id_id_key unique (gallery_id, id);

create trigger gallery_sections_touch before update on weave.gallery_sections
  for each row execute function weave.touch_updated_at();

-- Existing galleries remain exactly as they were: one visible section named
-- Gallery containing every existing member. New capabilities must not silently
-- change a live client's delivery.
insert into weave.gallery_sections (studio_id, gallery_id, name, position)
select studio_id, id, 'Gallery', 0
from weave.galleries;

alter table weave.gallery_files add column section_id uuid;

update weave.gallery_files as item
set section_id = section.id
from weave.gallery_sections as section
where section.gallery_id = item.gallery_id
  and section.name = 'Gallery'
  and item.section_id is null;

alter table weave.gallery_files
  alter column section_id set not null,
  add constraint gallery_files_section_belongs_to_gallery_fkey
    foreign key (gallery_id, section_id)
    references weave.gallery_sections(gallery_id, id) on delete cascade;
create index gallery_files_section on weave.gallery_files(section_id, position);

-- A share can have a calendar boundary and, when the studio chooses, a code.
-- The code itself is never stored: a browser only proves it against this hash.
alter table weave.galleries
  add column expires_on date,
  add column access_mode text not null default 'link'
    check (access_mode in ('link', 'code')),
  add column access_code_hash text,
  add constraint galleries_access_code_matches_mode check (
    (access_mode = 'link' and access_code_hash is null)
    or (access_mode = 'code' and access_code_hash is not null)
  );

alter table weave.gallery_sections enable row level security;
grant all on weave.gallery_sections to anon, authenticated, service_role;

notify pgrst, 'reload schema';
