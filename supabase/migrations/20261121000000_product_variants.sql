-- A product is the thing being sold; a variant is one sellable expression of
-- it, such as an 8×10 versus 12×18 print. A product may still have no
-- variants, preserving the simple fixed-price store.
create table weave.product_variants (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  product_id  uuid not null references weave.products(id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  price_delta bigint not null default 0,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index product_variants_product on weave.product_variants(product_id, position);
create trigger product_variants_touch before update on weave.product_variants
  for each row execute function weave.touch_updated_at();

-- An order records which variant was sold, and copies its words. The product
-- catalogue may evolve; the receipt must remain a fact about that sale.
alter table weave.order_items
  add column product_variant_id uuid references weave.product_variants(id) on delete set null,
  add column variant_name text;

alter table weave.product_variants enable row level security;
grant all on weave.product_variants to anon, authenticated, service_role;

notify pgrst, 'reload schema';
