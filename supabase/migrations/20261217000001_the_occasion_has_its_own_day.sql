-- When the occasion itself is.
--
-- A THIRD DATE ON ONE ROW, so it has to earn its place against the two already
-- there, or it becomes the drift this schema has already been cut once to
-- remove (`expected_on` beside `occasions.on_date`, two copies of one fact
-- with nothing keeping them in step).
--
--   asked_for      the day the client asked for, typed into the public form.
--                  A fact about the request. Never changes.
--   occasion_on    the day the OCCASION is. The wedding is on the fourteenth.
--   scheduled_for  the day the STUDIO WORKS. The engagement shoot is on the
--                  second; the wedding itself is shot on the fourteenth.
--
-- They are separate because they genuinely come apart: a pre-wedding session,
-- a birthday shot the weekend before, a christening photographed the day
-- after. The studio's diary runs on `scheduled_for`; the occasion is what the
-- booking is FOR, and the client thinks in it.
--
-- WHERE THIS GOES WRONG. If a studio always shoots on the day of the occasion,
-- these two hold the same value forever and one of them is redundant — and a
-- redundant date is one somebody will change in one place and not the other.
-- Nothing derives one from the other on purpose: a default would make the
-- copy silently, which is precisely how the last pair drifted.
alter table weave.bookings add column if not exists occasion_on date;

comment on column weave.bookings.occasion_on is
  'The day the occasion itself falls on, which is not necessarily the day the '
  'studio works — see scheduled_for. Left null when the studio has no reason '
  'to record it separately.';

create index if not exists bookings_occasion_on
  on weave.bookings (studio_id, occasion_on);

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
