-- A client cannot see what they are buying because nothing here knows what it
-- IS. A product is a name, a kind and a price; "12 × 18" is an opaque string.
-- The system cannot say whether that is wider than tall, let alone how big it
-- will be on a wall.
--
-- So a product may now state its real size. MAY: a variant that is "Lustre"
-- or "Matte" has no size, a digital file has no size, and every product that
-- exists today keeps working untouched. Only one that states its measurements
-- can be previewed. The thin version still works; the enriched one does more.
--
-- THE SIZE IS STATED, NEVER PARSED. Reading "12 × 18" and extracting numbers
-- would be inferring meaning from a studio's own label, and it breaks the
-- first time somebody writes 12x18", A3, or 30×45cm. The studio says the
-- measurements; the engine never guesses them from the name, and the name
-- remains the studio's word, shown verbatim.
--
-- Millimetres, as integers. Inches are fractional and a print is not the place
-- to discover floating point, same reasoning as money being in minor units.
alter table weave.products
  add column if not exists width_mm  integer check (width_mm  is null or width_mm  between 10 and 10000),
  add column if not exists height_mm integer check (height_mm is null or height_mm between 10 and 10000);

alter table weave.product_variants
  add column if not exists width_mm  integer check (width_mm  is null or width_mm  between 10 and 10000),
  add column if not exists height_mm integer check (height_mm is null or height_mm between 10 and 10000);

-- A size is both measurements or neither; one alone cannot make a rectangle.
do $$ begin
  alter table weave.products add constraint products_size_is_whole
    check ((width_mm is null) = (height_mm is null));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table weave.product_variants add constraint variants_size_is_whole
    check ((width_mm is null) = (height_mm is null));
exception when duplicate_object then null; end $$;

-- How the thing is presented, because the engine draws each one differently:
-- a print has a thin edge, a framed print has a moulding and a mat around the
-- picture, a canvas wraps around its stretcher and has no frame at all. Three
-- distinct renderings is what earns a kind here — "lustre" and "matte" do not,
-- and stay where they belong, in the studio's own words on the name.
alter table weave.products
  add column if not exists shown_as text not null default 'print'
    check (shown_as in ('print', 'framed', 'canvas'));

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
