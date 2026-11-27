-- The rename reached the tables, the columns and the rows already written.
-- It did not reach the FUNCTION that writes new ones.
--
-- `job_turn_is_recorded()` inserts the event that records a move from one
-- turn to another, and it had `'job'` written into its body as a literal. So
-- every move made after the rename would have been logged under a word
-- nothing else in the system uses any more — and the history of a booking is
-- read by `subject_type`, which means that history would simply stop,
-- silently, from the moment of the rename onward.
--
-- Caught by a test rather than by reading, which is the only reason it is
-- being fixed before anybody lost a day of history to it.
create or replace function weave.booking_turn_is_recorded()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.turn is distinct from old.turn then
    insert into weave.events (studio_id, subject_type, subject_id, action, payload)
    values (new.studio_id, 'booking', new.id, 'turn_changed',
            jsonb_build_object('from', old.turn, 'to', new.turn));
  end if;
  return new;
end;
$$;

-- Point the trigger at the new function and give both the word the rest of
-- the system uses.
drop trigger if exists jobs_turn_recorded on weave.bookings;

create trigger bookings_turn_recorded
  after update on weave.bookings
  for each row execute function weave.booking_turn_is_recorded();

alter trigger jobs_touch on weave.bookings rename to bookings_touch;

drop function if exists weave.job_turn_is_recorded();

notify pgrst, 'reload schema';
