-- A question is asked only where it applies.
--
-- A variable declared on a classification is asked whenever a booking carries
-- that classification. That is right for some: an Occasion has a date,
-- whichever occasion it is.
--
-- It is wrong for others. Glamour declares "Location Address" on Context, whose
-- values are Studio and Outdoor — so a studio sitting is asked for its address,
-- when choosing Studio IS the answer to where it happens. The classification
-- settled the question and the form asked it again.
--
-- There was no level below the dimension to say so. A variable could be owned
-- by a service, a dimension or a deliverable, and nothing could express "this
-- one only applies to some values of its dimension".
--
-- NOT BY MOVING OWNERSHIP DOWN TO THE VALUE. A variable that applies to three
-- of five values would then have to be declared three times, which is three
-- variables and three answers to one question. It stays owned by the dimension
-- and names the values it is asked for.
--
-- EMPTY MEANS EVERY VALUE, WHICH IS WHY THIS NEEDS NO BACKFILL. Silence is
-- permission, the same rule the classification kernel keeps and the same one
-- the premises flag keeps: a variable that has not narrowed itself applies to
-- all of them. So every variable already declared goes on behaving exactly as
-- it does today, and Occasion Date stays correct without being touched.

create table if not exists variable_dimension_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  variable_id uuid not null references variables(id) on delete cascade,
  dimension_value_id uuid not null references dimension_values(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (variable_id, dimension_value_id)
);

comment on table variable_dimension_values is
  'Which values of its dimension a variable is asked for. No rows at all means every value of it — silence is permission, not refusal.';

-- Every read asks "of the variables in play, which are narrowed, and to what?"
create index if not exists variable_dimension_values_by_variable
  on variable_dimension_values (organization_id, variable_id);

alter table variable_dimension_values enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'variable_dimension_values' and policyname = 'variable_dimension_values_own_org'
  ) then
    create policy variable_dimension_values_own_org on variable_dimension_values
      using (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- And where the studio itself is.
--
-- Nothing recorded it. Which is why "the location is the studio's address"
-- could not be said even once a booking was known to be held there — and why
-- the confirmation document, the invoice and the receipt a client keeps cannot
-- say where the business is.
--
-- A column, not a table. A studio has one address until it has two, and the day
-- it has two this moves onto whatever holds them along with its hours.

alter table organizations
  add column if not exists address text;

comment on column organizations.address is
  'Where the studio is. Shown on documents, and the location of work held at its own premises.';

notify pgrst, 'reload schema';
