-- The store: what is for sale in a gallery, and what somebody ordered.
--
-- A PRICE LIST is a named set of things with prices, attached to a gallery. One
-- list can serve many galleries, because a studio prices a season and not a
-- client; and a gallery can be given its own, because sometimes it prices one
-- client.
--
-- `kind` IS A CLOSED SET OF TWO, and that is the whole of it. The rule this
-- project settled on is that a kind is earned only where the ENGINE performs a
-- distinct act, and here it performs exactly two: a digital thing is fulfilled
-- by handing over the file, a physical thing has to be made and sent. Every
-- other difference - lustre or matte, eight by ten or twenty by thirty, album
-- or canvas - is the studio's own word in `name` and the engine has no opinion
-- about it. This is not the flat list of session types coming back.

create table weave.price_lists (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index price_lists_studio on weave.price_lists(studio_id);

create table weave.products (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references weave.studios(id) on delete cascade,
  price_list_id uuid not null references weave.price_lists(id) on delete cascade,
  name          text not null,
  kind          text not null default 'physical'
                  check (kind in ('digital', 'physical')),
  -- Minor units. Money is never a float: 0.1 + 0.2 is not 0.3 and a studio's
  -- takings are not a place to discover that.
  price         bigint not null check (price >= 0),
  currency      text not null default 'NGN',
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index products_list on weave.products(price_list_id, position);

-- Which list a gallery sells from. Null means nothing is for sale in it, which
-- is a real and common state: most galleries are a delivery, not a shop.
alter table weave.galleries
  add column if not exists price_list_id uuid references weave.price_lists(id) on delete set null;

-- AN ORDER.
--
-- No status column. Where an order stands is derived from three timestamps, so
-- the fact has one home and cannot drift from itself:
--
--   placed_at      the client finished the basket
--   paid_at        the money arrived (set by hand until a processor is wired)
--   fulfilled_at   it was made and sent, or the file was handed over
--
-- This is the same discipline as occasions, and the reason is the same: the
-- previous system carried thirteen status columns and enforced the transitions
-- of one.
create table weave.orders (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references weave.studios(id) on delete cascade,
  gallery_id    uuid references weave.galleries(id) on delete set null,
  job_id        uuid references weave.jobs(id) on delete set null,
  person_id     uuid references weave.people(id) on delete set null,
  -- Taken at the moment of ordering. A client who moves house next year must
  -- not silently rewrite where last year's prints were sent.
  ship_to       text,
  note          text,
  currency      text not null default 'NGN',
  placed_at     timestamptz not null default now(),
  paid_at       timestamptz,
  fulfilled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index orders_studio on weave.orders(studio_id, placed_at desc);
create index orders_job on weave.orders(job_id);
create index orders_gallery on weave.orders(gallery_id);

-- A LINE SNAPSHOTS ITS PRICE AND ITS NAME.
--
-- The product is referenced so the studio can still see what was bought, but
-- `name` and `unit_price` are copied in. Re-pricing a list next season must not
-- rewrite what a client was charged in March, and renaming a product must not
-- rewrite what their receipt said. This is the one place in this system where
-- copying is right: an order is history, and history does not move.
create table weave.order_items (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  order_id    uuid not null references weave.orders(id) on delete cascade,
  product_id  uuid references weave.products(id) on delete set null,
  file_id     uuid references weave.files(id) on delete set null,
  name        text not null,
  kind        text not null check (kind in ('digital', 'physical')),
  unit_price  bigint not null check (unit_price >= 0),
  quantity    integer not null default 1 check (quantity > 0),
  created_at  timestamptz not null default now()
);
create index order_items_order on weave.order_items(order_id);

create trigger price_lists_touch before update on weave.price_lists
  for each row execute function weave.touch_updated_at();
create trigger products_touch before update on weave.products
  for each row execute function weave.touch_updated_at();
create trigger orders_touch before update on weave.orders
  for each row execute function weave.touch_updated_at();

alter table weave.price_lists enable row level security;
alter table weave.products    enable row level security;
alter table weave.orders      enable row level security;
alter table weave.order_items enable row level security;

grant all on weave.price_lists to anon, authenticated, service_role;
grant all on weave.products    to anon, authenticated, service_role;
grant all on weave.orders      to anon, authenticated, service_role;
grant all on weave.order_items to anon, authenticated, service_role;

notify pgrst, 'reload schema';
