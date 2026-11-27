-- What somebody does, on the person.
--
-- The role was put on `weave.crew` — the booking-person edge — on the argument
-- that it is a fact about somebody ON a booking, so that the same person could
-- be second shooter on a wedding and lead on a portrait session. The studio
-- ruled otherwise: a role is what somebody IS at the studio, and it lives on
-- them. Chidi is a photographer whichever booking Chidi is on.
--
-- That is the simpler shape and it is one fact in one place. The cost is
-- stated here rather than discovered later: a person has ONE role, so a studio
-- whose second shooter leads the occasional session cannot record both, and
-- whoever needs that later is changing this column rather than adding a second
-- one beside it.
--
-- `weave.crew` goes back to being two ids and nothing else, which is what an
-- edge should be.
--
-- FREE TEXT, NEVER A LIST, for the same reason the occasion is: nothing in
-- this engine behaves differently for a photographer than a videographer. No
-- query branches on it; nothing is scheduled, priced or delivered by it. A
-- fixed set would be this project choosing a studio's vocabulary for it.
--
-- NULLABLE. Somebody joins a studio before anybody writes down what they do,
-- and `weave.people` is the table this project's progressive-enrichment rule
-- was written about: a person may be a name and grow from there.
alter table weave.people add column if not exists role text;

comment on column weave.people.role is
  'What this person does at the studio, in the studio''s own words and shown '
  'exactly as typed. A property of the person, not of any one booking.';

-- The role on the edge, written minutes ago and never used by a deployed
-- screen. Nothing to carry across: it holds no rows.
alter table weave.crew drop column if exists role;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
