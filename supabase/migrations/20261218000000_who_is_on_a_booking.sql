-- Who is on a booking.
--
-- `weave.crew` existed once as `(occasion_id, person_id)` and was dropped with
-- `weave.occasions`, which left nothing anywhere recording who does the work.
-- This is the same edge, re-hung on the thing that survived.
--
-- WHY A TABLE AND NOT A COLUMN, since the objection that removed occasions was
-- that a property had been made into an entity. A column holds ONE value, and
-- a wedding has a photographer and a second shooter and somebody on video. A
-- many-to-many property is a table in a relational database; the table is not
-- a claim that crew is a thing in its own right. It has no name, no date and
-- no life of its own — it is two ids and when it was written.
--
-- THE GRAIN CHANGED, and that is the real consequence of removing occasions.
-- It used to be one row per person per DAY — "Chidi is on Saturday" — which is
-- how a studio actually commits somebody. It is now one row per person per
-- BOOKING, because a booking is the only dated thing left. A studio that shoots
-- a wedding across three days books it as three bookings and staffs each.
--
-- ON DELETE CASCADE from both sides. A booking that is deleted takes its
-- staffing with it; a person removed from a studio stops being on its work.
-- Neither is a record worth keeping on its own, because neither says anything
-- without the two rows it points at.
create table if not exists weave.crew (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  booking_id  uuid not null references weave.bookings(id) on delete cascade,
  person_id   uuid not null references weave.people(id) on delete cascade,
  created_at  timestamptz not null default now(),

  -- Somebody is on a booking or they are not. Twice is not more on it.
  unique (booking_id, person_id)
);

create index if not exists crew_booking on weave.crew (booking_id);
create index if not exists crew_person on weave.crew (studio_id, person_id);

alter table weave.crew enable row level security;
grant all on weave.crew to anon, authenticated, service_role;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
