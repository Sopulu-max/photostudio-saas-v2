-- A variable belongs to whatever declares it.
--
-- `service_variables` was an accurate name for exactly as long as a variable
-- could only belong to a service. The moment a dimension became a second owner
-- — 20261005000000, "an Occasion has a date" — the name stopped describing the
-- table, and three of its seven rows today belong to a classification rather
-- than to any service at all.
--
-- Nothing was renamed then because nothing had to be. It has to be now: a
-- deliverable is about to become the third owner, and a deliverable whose
-- declarations live in a table called service_variables is not something to
-- hand over and call clean.
--
-- WHAT THIS IS NOT. It is not a data change. Every row, constraint, index and
-- foreign key survives a rename untouched — Postgres carries them across, which
-- is the whole reason to rename rather than to copy into a new table and drop
-- the old one. The counts before and after must be identical, and are checked.
--
-- THE COLUMNS TOO. package_variable_values.service_variable_id and
-- booking_line_variable_values.service_variable_id name the old table in their
-- own names. Renaming the table and leaving those would trade one wrong name
-- for two.

alter table if exists service_variables rename to variables;

alter table if exists package_variable_values
  rename column service_variable_id to variable_id;

alter table if exists booking_line_variable_values
  rename column service_variable_id to variable_id;

comment on table variables is
  'What has to be settled about the thing that declares it. Exactly one owner: a service (what varies about the work), a classification (what follows from an answer), or a deliverable (what a kind of output needs specifying).';

-- The constraint keeps its old name after a table rename, which would leave the
-- one thing describing the ownership rule still calling itself by the old
-- table. Renamed so nothing in the schema says service_variables any more.
alter table variables
  rename constraint service_variables_one_owner to variables_one_owner;

alter index if exists service_variables_pkey rename to variables_pkey;

-- PostgREST caches the schema, and every embed in the app names the table. It
-- answers 404 on the renamed relation until told.
notify pgrst, 'reload schema';
