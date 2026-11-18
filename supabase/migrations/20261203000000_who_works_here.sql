-- `weave.people` holds everybody a studio knows — its clients, the guests who
-- opened a gallery, a wedding planner, and the people who actually work there
-- — and nothing distinguished them. The crew picker offered every one of them,
-- so a studio could staff a shoot with its own customer.
--
-- The same absence has surfaced three times now: a client with a password
-- would resolve as an operator and land on the board, an invitation had
-- nothing to invite somebody AS, and crew could not be told from clients.
--
-- It is not a missing `role` column. In this system relatedness is DERIVED —
-- you are a client because a job points at you, a guest because a participant
-- row says so, a collaborator because a hub names you. Every relationship is
-- already an edge, except one: nothing anywhere says a person WORKS HERE.
-- That is the only fact with no edge behind it, so that is the fact to add.
--
-- A `people` row is already the studio-person edge, so employment belongs on
-- it rather than in a new table, and it is two timestamps rather than a flag
-- because people join and leave and a studio has reason to know who shot a
-- wedding in 2024. Derived, like everything else here:
--
--   joined_at set, left_at null  -> works here
--   joined_at null               -> not staff; a client, a guest, a planner
--   left_at set                  -> used to work here, and the history stands
alter table weave.people
  add column if not exists joined_at timestamptz,
  add column if not exists left_at   timestamptz;

do $$ begin
  alter table weave.people add constraint people_left_after_joining
    check (left_at is null or (joined_at is not null and left_at >= joined_at));
exception when duplicate_object then null; end $$;

-- EVERY PERSON WITH AN ACCOUNT ALREADY WORKS HERE. They are the operators —
-- `whoIsAsking` resolves a signed-in studio member through exactly this link
-- — so without backfilling them the team would read as empty on every studio
-- that exists, and nobody could be put on a shoot.
update weave.people
  set joined_at = created_at
  where auth_user_id is not null and joined_at is null;

create index if not exists people_who_works_here
  on weave.people (studio_id, joined_at)
  where joined_at is not null and left_at is null;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
