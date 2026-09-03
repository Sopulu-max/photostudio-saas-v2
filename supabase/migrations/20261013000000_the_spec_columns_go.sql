-- The spec columns go.
--
-- deliverables.spec_schema, deliverables.spec_values and
-- package_deliverables.spec_values were a variable system invented for one
-- screen: three field types against the eight the real one checks, no unit, no
-- bounds, no default, and no share of parseVariableValue. A deliverable
-- declares real variables now — the third owner beside a service and a
-- classification — and a package answers them through package_variable_values
-- like every other answer.
--
-- NOTHING IS LOST. All three columns are null on every row in this database:
-- 0 of 11 deliverables carried a schema or values, and 0 of 9 package promises
-- carried values. They were unreachable in the interface for their whole life —
-- the only way to set a schema was to type raw JSON into a textarea, and the
-- query that fed the package editor never selected the column, so the form they
-- were meant to drive could not draw for any deliverable, ever.
--
-- Checked immediately before this ran, not assumed. If a later database has
-- values in them, this drop would discard real data — so the guard below
-- refuses rather than trusting the comment.
--
-- default_unit STAYS. It is live: formatDeliverable counts in it, so a package
-- promising a video reads "30 seconds video" rather than "30 video".

do $$
declare
  offending integer;
begin
  select
    (select count(spec_schema) from deliverables)
  + (select count(spec_values) from deliverables)
  + (select count(spec_values) from package_deliverables)
  into offending;

  if offending > 0 then
    raise exception
      'Refusing to drop: % row(s) still carry a spec. Migrate them onto variables first.',
      offending;
  end if;
end $$;

alter table deliverables drop column if exists spec_schema;
alter table deliverables drop column if exists spec_values;
alter table package_deliverables drop column if exists spec_values;

notify pgrst, 'reload schema';
