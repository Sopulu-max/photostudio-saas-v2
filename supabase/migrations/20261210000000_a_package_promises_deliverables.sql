-- A PACKAGE PROMISES DELIVERABLES, not invented kinds.
--
-- The first cut of package_elements invented five types, three of which were
-- the studio's catalogue wearing a disguise:
--
--   picture (promised)  -> so many of a digital thing
--   video   (promised)  -> one of a digital thing
--   print   (promised)  -> a physical thing, with its size TYPED IN AGAIN
--
-- The engine could not tell any of them apart from a free-text `detail`, so
-- "8x10 framed" in a package had no connection to the 8x10 framed in the
-- studio's own catalogue. Two spellings of one object, and nothing to join
-- them on. `weave.deliverables` now holds those objects, so a package points
-- at one and says HOW MANY, and the question "is this posted or handed over"
-- is answered once, in the catalogue, instead of per package.
--
-- Three invented types collapse into one real edge. What remains of the
-- element types is what a package actually contains that is NOT a
-- deliverable:
--
--   deliverable  what the client receives: a catalogue row and a count
--   picture      a photograph the STUDIO shows, to sell the package
--   video        a film the STUDIO shows, to sell the package
--   text         prose
--   session      a condition of the day, spent rather than delivered
--
-- The old promised types are left in the check constraint rather than cut
-- out of it: the rows are converted below, but a constraint that rejects
-- what the deployed code might still write is how a release takes a studio's
-- packages down. Expand, deploy, then contract.
alter table weave.package_elements
  add column if not exists deliverable_id uuid
    references weave.deliverables(id) on delete restrict;

create index if not exists package_elements_deliverable
  on weave.package_elements (deliverable_id);

alter table weave.package_elements
  drop constraint if exists package_elements_type_check;

alter table weave.package_elements
  add constraint package_elements_type_check check (
    type in ('deliverable', 'picture', 'video', 'text', 'print', 'session')
  );

-- A promise of a deliverable has to say WHICH, and HOW MANY. Without both it
-- is not a promise, it is a gap on a page that somebody will have to explain
-- to a client later.
alter table weave.package_elements
  drop constraint if exists package_elements_deliverable_is_named;

alter table weave.package_elements
  add constraint package_elements_deliverable_is_named check (
    type <> 'deliverable' or (deliverable_id is not null and count is not null and count > 0)
  );

-- WHICH DELIVERABLE FILLS THE GALLERY.
--
-- A gallery is born at acceptance knowing how many pictures were promised,
-- and that number has to come from somewhere. It cannot be "every digital
-- deliverable": a highlight film is digital too, and a package promising six
-- edited images and one film does not promise seven pictures.
--
-- `kind` cannot answer it, and must not be made to - it is a closed set of
-- two because the engine performs two acts, and bending it into a third
-- meaning is how a kind column becomes the flat list of session types again.
-- So the studio says it, once, about its own catalogue: this is the thing
-- that arrives as pictures in a gallery.
alter table weave.deliverables
  add column if not exists fills_gallery boolean not null default false;

comment on column weave.deliverables.fills_gallery is
  'This deliverable arrives as the pictures in a gallery, so a package '
  'promising it sets that gallery''s size.';

-- Convert the elements that were really deliverables all along. Nothing is
-- invented here: rows are only converted where the studio already has a
-- deliverable of its own to point at, and anything left unmatched keeps its
-- old type and is visible in the builder as before.
update weave.package_elements e
set type = 'deliverable',
    deliverable_id = d.id,
    count = coalesce(e.count, 1),
    detail = null
from weave.deliverables d
where e.mode = 'promised'
  and e.type in ('picture', 'video', 'print')
  and d.studio_id = e.studio_id
  and lower(btrim(d.name)) = lower(btrim(coalesce(e.detail, '')));

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
