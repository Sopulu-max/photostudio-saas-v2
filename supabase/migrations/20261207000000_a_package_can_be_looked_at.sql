-- A package was a name, a price, a paragraph and a number. In an industry
-- where a studio wins work by showing the work, it could show nothing: on the
-- public page it was one line inside a <select>.
--
--   "I want studios to be able to add videos at the top of their cover pages.
--    Remember this is an industry where showcasing your work matters."
--   "No I want both cover photos alongside cover videos all together."
--
-- So: an ordered list of pictures and video belonging to a package.
--
-- THE COVER IS POSITION ZERO, not a column. A stored `is_cover` is a second
-- claim about the same thing and goes out of step with the ordering the first
-- time somebody drags a row; derived, there is nothing to disagree with. A
-- studio that wants a different cover moves it to the front, which is also
-- what it means.
--
-- KIND IS EARNED. A picture is drawn into an <img> and a video needs a
-- <video>, a poster frame and controls — the engine genuinely does something
-- different with each, which is the only thing that justifies a kind column.
-- Not 'portrait' versus 'landscape': that is a reading of the file.
--
-- WHAT THIS TOUCHES. Nothing existing changes shape. `weave.packages` gains
-- no column; this is an edge off it, so a package with no media is exactly
-- what a package is today. The storefront and the packages page both widen to
-- read it. Objects live in the same `weave-files` bucket as everything else,
-- under the studio's own prefix, so a stray object stays attributable.
create table if not exists weave.package_media (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references weave.studios(id) on delete cascade,
  package_id   uuid not null references weave.packages(id) on delete cascade,

  storage_path text not null,
  kind         text not null check (kind in ('image', 'video')),
  mime_type    text,
  size_bytes   bigint check (size_bytes is null or size_bytes >= 0),

  -- What a studio wrote about this frame, shown to a client. Optional,
  -- because most pictures say themselves.
  caption      text,

  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists package_media_package
  on weave.package_media (package_id, position, created_at);

create index if not exists package_media_studio
  on weave.package_media (studio_id);

alter table weave.package_media enable row level security;
grant all on weave.package_media to anon, authenticated, service_role;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
