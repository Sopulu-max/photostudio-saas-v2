-- A comment on a picture belongs to a gallery, and the row has said so since
-- it was created: `gallery_id` is not null and has always held a real gallery.
-- What was missing was the declaration. The only foreign key on the table was
-- the composite (gallery_id, file_id) -> gallery_files, which tells PostgREST
-- that a comment is attached to a FILE IN a gallery, and nothing more.
--
-- So `galleries.select('comments:gallery_comments(...)')` could never resolve:
-- PostgREST does not infer a relationship transitively, and the job page threw
-- PGRST200 rather than rendering. This states the relationship that the data
-- already obeys, which makes the embed legal and the page load.
--
-- Cascading effects, as required before a schema change:
--   * galleries -> gallery_comments becomes embeddable. One path only; the
--     composite key points at gallery_files, a different table, so there is no
--     ambiguity for PostgREST to complain about.
--   * on delete cascade matches the composite key's own behaviour, so deleting
--     a gallery removes its comments exactly as it did before.
--   * verified before writing this: 0 comment rows, 0 orphans, gallery_id is
--     already not null. Nothing can fail validation.
-- Guarded so the file is safe to run twice: the first constraint went on
-- before the second was found, and a migration that cannot be re-run is a
-- migration somebody has to remember the state of.
do $$ begin
  alter table weave.gallery_comments
    add constraint gallery_comments_gallery_id_fkey
    foreign key (gallery_id) references weave.galleries(id) on delete cascade;
exception when duplicate_object then null; end $$;

-- And the same omission one level down: the comment names a file, but the only
-- declaration was the composite key pointing at the join table, so
-- `file:files(name)` failed with PGRST200 too. Both halves of that embed were
-- undeclared, which is why the reading had never once run.
-- Checked first: file_id is not null, 0 rows, 0 orphans.
do $$ begin
  alter table weave.gallery_comments
    add constraint gallery_comments_file_id_fkey
    foreign key (file_id) references weave.files(id) on delete cascade;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
