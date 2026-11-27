-- WHAT A STUDIO DELIVERS, as a catalogue of its own.
--
-- The studio's things lived only inside price lists: `products` carries a
-- NOT NULL `price_list_id` and a `price`, so "8×10 framed" could not exist
-- as a thing the studio makes — only as a line in a list, at a price.
--
-- That was fine while the only question was "what is for sale in a gallery".
-- Two things broke it:
--
--   A PACKAGE INCLUDES WHAT IS ALREADY PAID FOR. A package promising six
--   retouched images and an 8×10 has no price to attach to either — the
--   package is the price. With identity welded to a price list, a package
--   had nowhere to point, so the first attempt had studios TYPING "8×10
--   framed" into each package by hand. The same object, spelled freshly
--   every time, with the engine unable to tell a file from a thing to post.
--
--   PRICING ONE CLIENT MEANT DUPLICATING THE OBJECT. The store was built so
--   "a gallery can be given its own [list], because sometimes it prices one
--   client". With the price on the same row as the name and the size, that
--   means a second "8×10 framed" row, and a third, each free to drift from
--   the others. The thing should exist once and be priced many times.
--
-- So: a DELIVERABLE is what the studio hands over, and it has no price. What
-- it costs is a fact about selling it, which belongs to the price list.
--
-- `kind` STAYS A CLOSED SET OF TWO, for the reason the store already gives:
-- the engine performs exactly two acts — hand over a file, or make it and
-- send it. Lustre or matte, album or canvas, 8×10 or 20×30 is the studio's
-- own word and the engine has no opinion about it. This is not the flat list
-- of session types coming back.
create table if not exists weave.deliverables (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,

  -- The studio's own word for it, shown exactly as typed, never re-cased.
  name        text not null check (btrim(name) <> ''),

  kind        text not null default 'physical'
                check (kind in ('digital', 'physical')),

  -- Millimetres, stated by the studio, never parsed out of the name. Only a
  -- physical thing has a size: a file is not eight inches wide.
  width_mm    integer check (width_mm is null or width_mm > 0),
  height_mm   integer check (height_mm is null or height_mm > 0),

  -- How the engine draws it on a wall. Three distinct renderings, which is
  -- what earns the kind; null for anything that is not hung.
  shown_as    text check (shown_as is null or shown_as in ('print', 'framed', 'canvas')),

  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A digital deliverable has no physical dimensions and hangs on no wall.
  constraint deliverables_digital_is_not_an_object check (
    kind <> 'digital' or (width_mm is null and height_mm is null and shown_as is null)
  )
);

create index if not exists deliverables_studio
  on weave.deliverables (studio_id, position, created_at);

alter table weave.deliverables enable row level security;
grant all on weave.deliverables to anon, authenticated, service_role;

create trigger deliverables_touch before update on weave.deliverables
  for each row execute function weave.touch_updated_at();

-- A price list entry may now name the deliverable it prices, so the same
-- object can appear in several lists at several prices without being spelled
-- again in each.
--
-- NULLABLE, and nothing is forced through it yet: the store works today on
-- `products.name` alone and must keep working. Expand now, move the store
-- over, contract later. Dropping the old columns before that would take the
-- shop down to tidy up behind it.
alter table weave.products
  add column if not exists deliverable_id uuid
    references weave.deliverables(id) on delete restrict;

create index if not exists products_deliverable
  on weave.products (deliverable_id);

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
