-- A picture of somebody who works here.
--
-- One column holding a path into the `weave-files` bucket, the same place
-- every other file in this system lives. Not a table: a person has one face,
-- and a row would be an entity standing beside a property again.
--
-- THE PATH, NOT A URL. The bucket is private, so what is stored is where the
-- object is and a signed URL is minted when somebody is actually looking.
-- A URL in a column would either be public — handing anybody who guesses an
-- id a studio's staff photographs — or expired by the time it was read.
--
-- ON `weave.people` RATHER THAN A STAFF TABLE, because there is no staff
-- table: employment is `joined_at` on this row. The column is therefore
-- reachable for a client too, and that is fine and probably wanted later;
-- nothing about it is specific to somebody who works here.
alter table weave.people add column if not exists avatar_path text;

comment on column weave.people.avatar_path is
  'Where their picture sits in the weave-files bucket. A path, never a URL: '
  'the bucket is private and URLs are signed at the moment of reading.';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
