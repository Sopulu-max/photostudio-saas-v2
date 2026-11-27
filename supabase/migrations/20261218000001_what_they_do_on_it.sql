-- What somebody does on a booking.
--
-- ON THE EDGE, NOT ON THE PERSON. A role is not a fact about Chidi; it is a
-- fact about Chidi ON THIS BOOKING. The same person is second shooter on a
-- wedding and the lead on a portrait session the following week, and a role
-- stored against `weave.people` could only ever say one of those.
--
-- FREE TEXT, NEVER A LIST, for the same reason the occasion is. Nothing in
-- this engine behaves differently for a photographer than for a videographer:
-- no query branches on it, nothing is scheduled or priced or delivered by it.
-- A fixed set of values would be this project choosing a studio's vocabulary
-- for it, which is the thing it spent a year undoing.
--
-- NULLABLE, because somebody can be put on a booking before anybody has said
-- what they will be doing. "Chidi is on the Okafor wedding" is a complete
-- thought; progressive enrichment is the rule here as everywhere.
alter table weave.crew add column if not exists role text;

comment on column weave.crew.role is
  'What this person does on THIS booking, in the studio''s own words and shown '
  'exactly as typed. Not a property of the person: the same person has '
  'different roles on different bookings.';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
