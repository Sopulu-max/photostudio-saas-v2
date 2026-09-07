-- What the client said, and what the booking is for.
--
-- These are two different facts and they have been sharing one field.
--
-- A public booking arrives with the client's answers written into
-- bookings.metadata as form_responses. That JSON is a record of an EVENT: on
-- this day, this person ticked these boxes. It is evidence, and it should never
-- be rewritten — a client remembers what they submitted.
--
-- But a booking also has a classification of its own: what the studio
-- understands the work to be. It starts as a copy of what the client said and
-- from then on belongs to the studio, because clients misread forms. Pius James
-- ticked Maternity and meant a wedding, and with the answer living only in the
-- record of his submission there was no way to correct the understanding
-- without falsifying the evidence — so the studio was cornered into offering
-- maternity packages for a wedding.
--
-- THE SECOND THING THIS FIXES, which nobody had noticed: a booking's
-- classification existed ONLY as that JSON, or as the narrowing on a package
-- instance once one was added. So listBookingsForDimensionValue — "what was
-- booked under this classification?" — resolves entirely through packages, and
-- an enquiry that names an occasion but has not been sold anything yet counts
-- under nothing at all. Pius said Maternity out loud and appeared under no
-- occasion.
--
-- ONE VALUE PER QUESTION, unlike everywhere else in this graph. A service
-- names what it CAN do and a package narrows to what it WILL do — both are
-- ranges, so both take many rows per dimension. A booking is the fact at the
-- end of that narrowing: this job is one occasion, in one context. The unique
-- constraint says so.

-- Needed so a row can be keyed to a value AND its dimension at once, below.
create unique index if not exists dimension_values_id_dimension
  on dimension_values (id, dimension_id);

create table if not exists booking_dimension_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  -- Carried alongside the value so "one answer per question" is a constraint
  -- the database enforces rather than a rule the application remembers.
  dimension_id uuid not null,
  dimension_value_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite, so the pair cannot drift: a row can never claim a value belongs
  -- to a dimension it does not belong to.
  foreign key (dimension_value_id, dimension_id)
    references dimension_values (id, dimension_id) on delete cascade,
  unique (booking_id, dimension_id)
);

comment on table booking_dimension_values is
  'What the studio understands this booking to be for. Seeded from the client''s answers at intake, and the studio''s to correct thereafter — bookings.metadata keeps what was actually submitted.';

create index if not exists booking_dimension_values_by_booking
  on booking_dimension_values (organization_id, booking_id);

-- Every "what was booked under this classification?" read starts here.
create index if not exists booking_dimension_values_by_value
  on booking_dimension_values (organization_id, dimension_value_id);

alter table booking_dimension_values enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'booking_dimension_values' and policyname = 'booking_dimension_values_own_org'
  ) then
    create policy booking_dimension_values_own_org on booking_dimension_values
      using (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- BACKFILL 1: every booking already taken gets the classification it arrived
-- with.
--
-- Forward-only would mean the correction works for bookings taken from tomorrow
-- and every existing enquiry stays stuck with its answer buried in JSON. The
-- studio's live bookings are exactly the ones somebody needs to fix.
--
-- Joined through dimension_values rather than trusted: metadata is a client
-- submission, so an id in it is only a claim. One that names no value of this
-- organization's is dropped rather than inserted.
--
-- KEYED ON THE VALUE, AND THE KEY IS IGNORED. The object has been written two
-- ways over this app's life — {"occasion": "<value id>"} early on, and
-- {"<dimension id>": "<value id>"} since — and Victor Oloamiwe's booking still
-- holds the first. Casting that key to a uuid is how the first attempt at this
-- migration died: `invalid input syntax for type uuid: "occasion"`.
--
-- The key was never needed. A value already knows which question it answers,
-- so the dimension is read off dimension_values and both shapes work without
-- the migration knowing there are two.
--
-- The CASE, rather than a WHERE, guards the remaining cast: a filter can be
-- evaluated after the projection and the cast would still raise. CASE cannot
-- be reordered around itself.

insert into booking_dimension_values (organization_id, booking_id, dimension_id, dimension_value_id)
select distinct
  b.organization_id,
  b.id,
  dv.dimension_id,
  dv.id
from bookings b
cross join lateral jsonb_each_text(
  coalesce(b.metadata -> 'form_responses' -> 'dimensions', '{}'::jsonb)
) as answered(dimension_key, value_id)
join dimension_values dv
  on dv.id = (
       case when answered.value_id ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       then answered.value_id::uuid end
     )
 and dv.organization_id = b.organization_id
on conflict (booking_id, dimension_id) do nothing;

-- ---------------------------------------------------------------------------
-- BACKFILL 2: the client's own words reach the column built to hold them.
--
-- bookings.brief exists. It is editable, it is rendered, and changing it raises
-- a brief_updated event. createBookingFromIntake never wrote it, so what a
-- client typed went into JSON and the field stayed null on every booking ever
-- taken.
--
-- Jozzy B typed "Pre wedding pics". It was not lost, but it was not anywhere a
-- studio would look, and it could not be corrected, searched or audited.
--
-- Only where the brief is still empty: a studio that has since written its own
-- owns it, and this must not overwrite that with the client's original words.

update bookings
   set brief = trim(metadata -> 'form_responses' ->> 'message')
 where brief is null
   and coalesce(trim(metadata -> 'form_responses' ->> 'message'), '') <> '';

notify pgrst, 'reload schema';
