-- A cover is a set of pictures, and the cover is the first of them.
--
-- WHY THIS IS NOT A COLUMN. cover_position was added as "a fact about this
-- picture in this frame, meaningless apart from the picture and worthless if
-- the picture is replaced". That was true of one picture and it is still true
-- of twenty: each one is cropped differently because each one is framed
-- differently. A url array could not carry that, and a pair of parallel arrays
-- would be two lists that can silently disagree about their own length. So:
-- rows, one per picture, each holding its own framing.
--
-- WHAT A COVER STILL IS. The single cover was not only decoration — the public
-- package page hands it to OpenGraph as the image a link preview shows, and a
-- link preview cannot be a slideshow. So the cover survives exactly, as SLIDE
-- ONE: not a second fact to keep in step with this table, but a reading of it.
-- `sort` decides, and the studio reorders to choose a different cover, which is
-- the same act as choosing which picture leads.
--
-- WHY NOT THE assets TABLE. That one is booking-scoped, deliverable-scoped,
-- lives in a private bucket and carries a state machine, because it is what a
-- client is delivered. These are public marketing for something nobody has
-- bought yet. Same file type, opposite lifecycle.
--
-- SERVICES AND BOOKINGS ARE NOT TOUCHED. They carry the same cover_url and
-- cover_position pair, and the same shape would suit them. Converting all three
-- because one was asked for is how a schema grows things nobody requested.

create table if not exists package_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  package_id uuid not null references packages(id) on delete cascade,
  -- Public URL, as cover_url was. The studio's own bucket, same as every other
  -- picture this app puts somewhere.
  url text not null,
  -- CSS background-position for THIS picture in its frame. Null means centred,
  -- which is what every cover did before it could say otherwise.
  position text,
  -- Which slide this is. Not unique: reordering a list whose order is a unique
  -- constraint means inventing temporary values for rows that are not moving.
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table package_images is
  'The pictures a package is sold with, in order. The first is the cover — including the one a link preview shows.';

-- Every read is "this package's pictures, in order".
create index if not exists package_images_in_order
  on package_images (organization_id, package_id, sort, created_at);

-- ---------------------------------------------------------------------------
-- Twenty.
--
-- Enforced here rather than only in the action, because a limit that lives in
-- one caller is a limit until somebody writes a second caller. Twenty is the
-- number asked for; the reason it needs a number at all is that these load on a
-- public catalogue where every one of them is bytes a client waits for.

create or replace function package_images_stay_under_twenty()
returns trigger language plpgsql as $$
declare
  held integer;
begin
  select count(*) into held from package_images where package_id = new.package_id;
  if held >= 20 then
    raise exception 'A package shows at most 20 pictures; this one already has %.', held
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists package_images_cap on package_images;
create trigger package_images_cap
  before insert on package_images
  for each row execute function package_images_stay_under_twenty();

-- ---------------------------------------------------------------------------
-- And the covers that already exist.
--
-- Four of seven packages carry one. Each becomes slide one of its own package,
-- keeping its framing, so nothing that was uploaded is lost and no cover moves.
-- Guarded and idempotent: re-running must not give a package two copies of the
-- same picture.

insert into package_images (organization_id, package_id, url, position, sort)
select p.organization_id, p.id, p.cover_url, p.cover_position, 0
from packages p
where p.cover_url is not null
  and not exists (
    select 1 from package_images i
    where i.package_id = p.id and i.url = p.cover_url
  );

-- Refuse to drop the columns while a cover exists that did not make it across.
do $$
declare
  stranded integer;
begin
  select count(*) into stranded
  from packages p
  where p.cover_url is not null
    and not exists (
      select 1 from package_images i
      where i.package_id = p.id and i.url = p.cover_url
    );

  if stranded > 0 then
    raise exception
      'Refusing to drop packages.cover_url: % cover(s) were not carried over.', stranded;
  end if;
end $$;

alter table packages drop column if exists cover_url;
alter table packages drop column if exists cover_position;

notify pgrst, 'reload schema';
