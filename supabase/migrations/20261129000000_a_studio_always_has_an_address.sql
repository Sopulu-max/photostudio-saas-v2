-- Making `slug` not-null put the burden of inventing one on every caller, and
-- the first thing that happened is that five test files broke: they create a
-- studio with a name and nothing else, which is exactly what a caller should
-- be allowed to do.
--
-- That is a design smell, not a test problem. "Every studio has an address" is
-- an invariant of what a studio IS, so it belongs to the table rather than to
-- whoever is inserting. A studio with a name now gets an address whether or not
-- anyone thought to ask for one.
create or replace function weave.give_the_studio_an_address() returns trigger
language plpgsql as $$
declare
  v_base text;
  v_try  text;
  v_n    integer := 1;
begin
  if new.slug is not null and btrim(new.slug) <> '' then
    return new;
  end if;

  v_base := coalesce(weave.slugify(new.name), 'studio');
  v_try := v_base;
  -- Two studios may genuinely share a name; the second one gets a number.
  while exists (select 1 from weave.studios s where s.slug = v_try and s.id <> new.id) loop
    v_n := v_n + 1;
    v_try := v_base || '-' || v_n::text;
  end loop;

  new.slug := v_try;
  return new;
end $$;

drop trigger if exists studios_always_have_an_address on weave.studios;
create trigger studios_always_have_an_address
  before insert on weave.studios
  for each row execute function weave.give_the_studio_an_address();

notify pgrst, 'reload schema';
