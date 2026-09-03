-- A note can be about something.
--
-- Notes shipped attached to nothing, deliberately: a column nothing reads is
-- how this codebase got a jsonb spec_schema no screen could reach. Now there is
-- a surface for it, so there is a column for it.
--
-- THE SHAPE THE EVENTS TABLE ALREADY USES — entity_type plus entity_id — because
-- a note about a booking and a note about a client differ only in what they
-- point at, and two nullable foreign keys would become four the moment a third
-- thing wanted notes.
--
-- BOTH OR NEITHER, AND ONLY THE TWO KINDS THAT HAVE A SURFACE. A type with no
-- id points nowhere; an id with no type cannot be resolved. And a type this app
-- cannot render is a note that exists and can never be found, which is worse
-- than one that was refused — so the check names the kinds rather than
-- accepting any string. Adding a third means adding it here, which is the
-- reminder that it also needs somewhere to be read.
--
-- Null for both is a standalone note, which is what every existing note is.

alter table notes
  add column if not exists about_type text,
  add column if not exists about_id uuid;

comment on column notes.about_type is
  'What kind of thing this note is about — booking or client. Null with about_id for a note about nothing in particular.';

alter table notes drop constraint if exists notes_about_is_whole;
alter table notes add constraint notes_about_is_whole
  check (
    num_nonnulls(about_type, about_id) in (0, 2)
    and (about_type is null or about_type in ('booking', 'client'))
  );

-- Every read from a booking or a client page is "the notes about this one".
create index if not exists notes_about
  on notes (organization_id, about_type, about_id)
  where about_type is not null;

-- ---------------------------------------------------------------------------
-- And the field this replaces.
--
-- clients.notes was a textarea labelled "Notes", placeholder "Anything worth
-- remembering about this client" — the same sentence, the same purpose, and a
-- second place to write it. Two answers to "where do I write a note about this
-- client" is the drift this codebase keeps paying for.
--
-- It is empty on every client in this database: 0 of 10 carry a single
-- character. So nothing is migrated because there is nothing to migrate, and
-- the guard below refuses rather than trusting that sentence to stay true.

do $$
declare
  written integer;
begin
  select count(*) into written
  from clients
  where notes is not null and length(trim(notes)) > 0;

  if written > 0 then
    raise exception
      'Refusing to drop clients.notes: % client(s) have something written there. Move them onto notes first.',
      written;
  end if;
end $$;

alter table clients drop column if exists notes;

notify pgrst, 'reload schema';
