-- A note can come back.
--
-- WHY THIS IS NOT A TASK. It was refused once on the grounds that Tasks already
-- existed. Tasks is a page that says "Coming soon" over an emoji; it reads no
-- table and tracks nothing. The thing that DOES exist, and that already gathers
-- everything this studio has to be somewhere for, is the calendar — it reads
-- bookings and money due, and a note with a date on it belongs in exactly that
-- gathering. So this is not a second to-do system. It is working memory being
-- allowed to say WHEN, and the surface that already answers "what is coming"
-- learning about one more kind of thing.
--
-- A MOMENT, NOT A DAY. timestamptz, like every other instant in this schema:
-- "ring the framer on Wednesday" and "ring the framer at nine on Wednesday" are
-- the same fact at different precisions, and a date column would have forced
-- every caller to invent a time anyway. The interface decides how much of it to
-- show; the row keeps what it was told.
--
-- IT DOES NOT FIRE, AND NOTHING IS OWED. A reminder here is a note appearing on
-- a day, not an alarm and not a job queue. Nothing polls this column, nothing
-- sends anything, and a reminder whose moment has passed keeps existing exactly
-- as it was — because it is still what the studio wrote down, and a note that
-- deleted itself for being late would be working memory that forgets.
--
-- Null is a note with no date, which is most of them.

alter table notes
  add column if not exists remind_at timestamptz;

comment on column notes.remind_at is
  'When this note should come back, shown on the calendar. Null for a note with no date, which is most of them. Not an alarm: nothing polls it and nothing is sent.';

-- Every read from the calendar is "this studio's dated notes, between two
-- instants". Partial, because most notes have no date and there is no reason
-- for them to sit in this index.
create index if not exists notes_remind_at
  on notes (organization_id, remind_at)
  where remind_at is not null;

notify pgrst, 'reload schema';
