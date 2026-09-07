-- One clock decides what is recent.
--
-- Five tables were having updated_at written by the application, as
-- `new Date().toISOString()`, while the same column is defaulted by the
-- database with now() on insert. So "which of these is most recent?" was being
-- answered by comparing two different machines' clocks.
--
-- HOW IT SHOWED UP. tests/notes.test.ts creates a note, waits, creates a
-- second, waits again, edits the first, and expects the edit to move it to the
-- top. It began failing — reproducibly, in isolation — because this machine is
-- currently 1.8 seconds behind the database host. The edit therefore stamped a
-- time EARLIER than the second note's insert, and the note the studio had just
-- edited sank instead of rising.
--
-- IT IS NOT A TEST PROBLEM. A deployed Next.js server and a hosted Postgres
-- are always different machines, and NTP drift of a second or two is ordinary.
-- Every list ordered by updated_at — the studio's notes, an attendance record,
-- a task board — could put a row that was just touched underneath one that was
-- not. Nothing errors; the order is simply wrong sometimes.
--
-- THE FIX ALREADY EXISTED. 001_kernel_schema.sql defines update_updated_at()
-- and attaches it to the twelve tables that shipped with it. Every table added
-- since was left to the application to stamp by hand, which is the drift this
-- repairs — the rule goes back where it can only be told the time once.

do $$
declare
  t text;
begin
  foreach t in array array[
    'attendance',                -- who was where, corrected after the fact
    'employees',                 -- working days, changed as a rota changes
    'booking_tasks',             -- the work board
    'booking_dimension_values'   -- what the studio understands a booking to be
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_%s_updated on %I', t, t);
      execute format(
        'create trigger trg_%s_updated before update on %I
           for each row execute function update_updated_at()', t, t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- NOTES ARE THE EXCEPTION, AND THE EXCEPTION IS THE POINT OF THE COLUMN.
--
-- A blanket trigger fires on every update, and pinning a note is an update. So
-- a studio that unpinned an old note would watch it jump to the top of the
-- list — they had not written anything, they had only stopped holding it
-- there, and the list is ordered by when a note was last worked on.
--
-- Pinning is placement; the timestamp is about the note itself. Naming the
-- columns rather than excluding `pinned` is deliberate: it states what
-- updated_at means here, so a column added later has to be considered rather
-- than silently counting.

drop trigger if exists trg_notes_updated on notes;

create trigger trg_notes_updated
  before update on notes
  for each row
  when (
    old.title      is distinct from new.title
    or old.body    is distinct from new.body
    or old.about_type is distinct from new.about_type
    or old.about_id   is distinct from new.about_id
  )
  execute function update_updated_at();

notify pgrst, 'reload schema';
