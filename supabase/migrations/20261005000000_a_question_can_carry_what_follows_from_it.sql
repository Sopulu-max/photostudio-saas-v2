-- An Occasion has a date.
--
-- A dimension is a question the studio asks about its work — the schema says so
-- outright, in the `question` column. Until now the only thing a question could
-- carry was its list of acceptable answers. It could ask "what occasion is it
-- for?" and accept "Birthday", and then have nothing further to say, even
-- though a birthday obviously has a date.
--
-- The only way to capture that date was a free-text question invented inside
-- one package. Every package serving birthdays would re-invent it, no answer
-- would connect to the Occasion dimension, and nobody could ever ask when this
-- month's occasions are.
--
-- WHY THIS IS NOT A NEW TABLE. A variable already exists, with a kind, a unit,
-- options, bounds and a default; a package already decides whether it fixes one
-- or leaves it to the client; a booking line already holds the answer. All of
-- that machinery would have to be built a second time for a dimension's
-- variables, which is the duplication this codebase keeps paying for. So a
-- variable gains an owner instead: exactly one of a service or a dimension.
--
--   service:   what varies about the WORK        — outfits, coverage hours
--   dimension: what varies about the CLASSIFICATION — the date of the occasion
--
-- The table keeps its name for now. It is too narrow — these are not only
-- services' variables any more — but renaming it is an outage in the same shape
-- as dropping a column while the deployed code still reads it. A follow-up
-- migration can take the name once nothing is mid-flight.
alter table service_variables alter column service_id drop not null;

alter table service_variables
  add column if not exists dimension_id uuid references dimensions(id) on delete cascade;

create index if not exists service_variables_dimension_idx
  on service_variables (dimension_id);

-- Exactly one owner. A variable belonging to both would be answerable twice and
-- inheritable by two different routes; one belonging to neither is unreachable.
alter table service_variables
  drop constraint if exists service_variables_one_owner;
alter table service_variables
  add constraint service_variables_one_owner
  check (num_nonnulls(service_id, dimension_id) = 1);

-- The uniqueness rule has to follow the owner. A key was unique per service;
-- now it is unique per whichever thing owns it, or a dimension could hold two
-- variables called the same thing.
drop index if exists service_variables_unique_key;
create unique index if not exists service_variables_unique_service_key
  on service_variables (service_id, lower(key)) where service_id is not null;
create unique index if not exists service_variables_unique_dimension_key
  on service_variables (dimension_id, lower(key)) where dimension_id is not null;

comment on column service_variables.dimension_id is
  'Set when this variable belongs to a dimension rather than a service: what follows from an answer, such as the date of an occasion. Exactly one of service_id and dimension_id is set.';
