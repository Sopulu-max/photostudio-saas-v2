-- Seeing a print on a wall means seeing a REAL WALL. Pic-Time composites the
-- client's picture into photographs of styled rooms, and that photography is
-- what makes it convincing — a drawn room is a diagram of a room, which is
-- the thing that sells nothing.
--
-- So a scene is a photograph the studio supplies. Theirs, not ours: a
-- photographer owns a camera and shoots in better rooms than a stock library,
-- and a studio's own spaces in its own light beat a generic set. It is also
-- the only version of this that is honestly theirs.
--
-- THE GEOMETRY IS THREE NUMBERS, because the scenes are shot square-on to the
-- wall — checked against a real Pic-Time configurator, where the lens is
-- parallel to the wall and the composite is a plain rectangle. No perspective,
-- no homography, no canvas.
--
--   wall_mm  how wide the photograph is in real life. A print of 508mm on a
--            2600mm wall takes 508/2600 of the image width, so every size is
--            true against the furniture without anyone measuring anything.
--   hang_x   where the middle of the print sits, as a fraction of the image.
--   hang_y   likewise, down from the top.
--
-- The print's HEIGHT is never stored: it falls out of the product's own
-- dimensions. Storing it would be a second place for the same fact to live,
-- and the two would disagree the first time a studio corrected a size.
create table if not exists weave.room_scenes (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references weave.studios(id) on delete cascade,
  name         text not null check (btrim(name) <> ''),
  storage_path text not null,

  -- Null means this is a DETAIL SHOT — the edge of a frame, a float mount, a
  -- corner — shown as it is with nothing composited into it. Those sell the
  -- craft and they are half of what is in Pic-Time's thumbnail strip. A kind
  -- column would only restate what the absence of a measurement already says.
  wall_mm      integer check (wall_mm is null or wall_mm between 300 and 20000),
  hang_x       numeric(6,5) check (hang_x is null or (hang_x >= 0 and hang_x <= 1)),
  hang_y       numeric(6,5) check (hang_y is null or (hang_y >= 0 and hang_y <= 1)),

  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- A scene either knows how to hang a picture or it does not. Half-knowing
  -- would mean guessing at render time, and a guess on a wall is a wrong size.
  check (num_nulls(wall_mm, hang_x, hang_y) in (0, 3))
);

create index if not exists room_scenes_studio on weave.room_scenes (studio_id, position, created_at);

create trigger room_scenes_touch before update on weave.room_scenes
  for each row execute function weave.touch_updated_at();

alter table weave.room_scenes enable row level security;
grant all on weave.room_scenes to anon, authenticated, service_role;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
