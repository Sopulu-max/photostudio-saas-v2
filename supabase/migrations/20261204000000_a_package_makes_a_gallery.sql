-- The old system held "Wedding — 400 images" as a sentence. The structure
-- described work it had no way to produce, so writing a package felt like
-- typing rather than building, and no amount of dragging blocks around was
-- going to fix that: blocks are another way of DESCRIBING.
--
-- A package should not describe a gallery. It should PRODUCE one. The moment
-- a booking is accepted the gallery exists, attached to the job, sized by
-- what was promised. The promise stops being a clause and becomes an object
-- with a shape, and that is what makes it concrete.
create table if not exists weave.packages (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  about       text,

  -- Minor units, like every other figure here. 0.1 + 0.2 is not 0.3 and a
  -- studio's prices are not where anybody should find that out.
  price       bigint check (price is null or price >= 0),
  currency    text not null default 'NGN',

  -- What the client gets back, and the whole point of the table. Null means
  -- the studio has not said yet — a package can exist as a name and grow a
  -- promise later, the way everything here is allowed to start thin.
  pictures_promised integer check (pictures_promised is null or pictures_promised between 1 and 100000),

  -- Null means it is not offered at the studio's public address yet. Derived
  -- state, not a `status` column: published is a thing that happened.
  published_at timestamptz,

  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists packages_studio on weave.packages (studio_id, position, created_at);

create trigger packages_touch before update on weave.packages
  for each row execute function weave.touch_updated_at();

-- What was booked. On the job, because the job is the booking.
alter table weave.jobs
  add column if not exists package_id uuid references weave.packages(id) on delete set null;

-- THE PROMISE IS SNAPSHOT, NOT REFERENCED. A studio that later changes a
-- package from 400 pictures to 300 must not silently change what it already
-- agreed with somebody. Same reasoning as an order line copying its price:
-- this is history, and history does not move.
--
-- And it is a COUNT, never four hundred empty rows. Materialising the promise
-- as data would be fabricating structure — the old disease in a new costume —
-- and the rows would disagree with the package the first time one changed.
-- How full a gallery is is derived: promised, minus what is actually in it.
alter table weave.galleries
  add column if not exists pictures_promised integer
    check (pictures_promised is null or pictures_promised between 1 and 100000);

alter table weave.packages enable row level security;
grant all on weave.packages to anon, authenticated, service_role;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
