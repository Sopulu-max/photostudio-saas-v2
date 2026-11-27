-- A package was a name, a price, a paragraph and one number. Writing one felt
-- like typing, because it was: the studio described work the system had no way
-- to make.
--
-- THE IDEA, in the studio's words: laying out a package should feel like
-- laying out a page — dropping in a cover, some words, a row of picture slots
-- — and the result should BE the package rather than a description of one. It
-- reads like a gallery because it IS one, before anything is in it. The client
-- buys the empty shape; later the same shape arrives full.
--
-- SHOWN OR PROMISED. That is the cut that makes this not a page builder.
--   shown    — the studio fills it now. It sells the package. A cover, a
--              sample spread, a paragraph about the session.
--   promised — the client fills it later. It IS the product. Four picture
--              slots, a framed print, their film.
-- Every element must answer it. An element that is neither is a dataview
-- element, which is what the July builder was made of and why it was removed.
--
-- FIVE TYPES, EACH EARNING ITSELF by what the engine does with it:
--   picture  files land in it, and it is counted
--   video    a film, which plays rather than tiles
--   text     prose, and nothing else
--   print    an object made at a size and posted
--   session  a condition of the day — outfits, hours — spent, never delivered
-- NOT a separate 'cover': a cover is the first shown picture, exactly as it
-- already is in package_media. Position is a reading, not a kind.
--
-- ROWS, NOT A JSON BLOB. If the layout were `props jsonb` then "how many
-- pictures does this promise" means walking a tree — and the dashboard's
-- short-of-promise reading, the gallery's size at acceptance and the
-- storefront's own line all have to do it. As rows, that question is
--   where type = 'picture' and mode = 'promised'
-- and every reading downstream stays SQL.
--
-- WHAT THIS TOUCHES. `packages.pictures_promised` becomes derivable from the
-- document and stops being something a studio types. It is NOT dropped here:
-- expand first, let the code that reads it move over, contract later. Nothing
-- else changes shape — this is an edge off packages, so a package with no
-- elements is exactly the package that exists today.
create table if not exists weave.package_elements (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  package_id  uuid not null references weave.packages(id) on delete cascade,

  type        text not null check (type in ('picture', 'video', 'text', 'print', 'session')),
  mode        text not null check (mode in ('shown', 'promised')),

  -- How many. Pictures promised, outfits included, hours booked. Null where
  -- the type does not count — a paragraph is not a quantity.
  count       integer check (count is null or count between 1 and 100000),

  -- What a text element says.
  body        text,

  -- The particulars: "8×10 framed", "Outfits", "Hours". Free text on purpose
  -- — these are the studio's own words for its own offering, and a fixed
  -- vocabulary here would be the old ontology growing back.
  detail      text,

  -- What a SHOWN picture or video actually is. Promised elements have none:
  -- that is the whole point of them.
  media_id    uuid references weave.package_media(id) on delete set null,

  position    integer not null default 0,
  created_at  timestamptz not null default now(),

  -- A promised element with no count is a promise of nothing.
  constraint package_elements_promised_counts check (
    mode <> 'promised' or type not in ('picture', 'session') or count is not null
  ),
  -- Nothing is shown that has nothing to show.
  constraint package_elements_shown_has_media check (
    mode <> 'shown' or type not in ('picture', 'video') or media_id is not null
  )
);

create index if not exists package_elements_package
  on weave.package_elements (package_id, position, created_at);

create index if not exists package_elements_studio
  on weave.package_elements (studio_id);

-- Read whenever a promise is counted, which is on every storefront page, the
-- packages list and at acceptance.
create index if not exists package_elements_promised
  on weave.package_elements (package_id, type)
  where mode = 'promised';

alter table weave.package_elements enable row level security;
grant all on weave.package_elements to anon, authenticated, service_role;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
