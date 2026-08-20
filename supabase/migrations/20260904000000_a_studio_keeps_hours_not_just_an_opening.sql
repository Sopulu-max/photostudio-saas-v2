-- A studio keeps hours: a week, and the days that break it.
--
-- WHAT WAS WRONG. The previous migration modelled one opening time plus a list
-- of "exceptions", and put the ordinary week in the exception list. A studio's
-- normal Saturday is not an exception to anything — it is the schedule. Reading
-- "we open at ten on Saturdays" as an exception makes the common case look like
-- the odd one, and it left the studio no way to say when it CLOSES at all.
--
-- WHAT IT IS NOW. One table of hours, answering the same question at three
-- scales, most specific first:
--
--   a named date        — Christmas, one Tuesday the power went
--   an nth weekday      — the last Saturday of the month
--   a weekday           — the ordinary week, Monday through Sunday
--   (and beneath all of it, the studio's default on organizations)
--
-- They are one table because they are one question — what does this studio do
-- on this day — and separating the week from its exceptions would mean asking
-- twice and reconciling the answers here.
--
-- CLOSING TIME, at every level. Opening alone cannot say a studio shuts at
-- three on Fridays. Optional, because a studio may know when it opens and not
-- when it will be done — progressive enrichment, as everywhere else.
--
-- NO ORDERING CONSTRAINT between opens and closes. A studio that shuts at 2am
-- closes on a smaller clock than it opened, and a check would reject a real
-- studio to catch a typo.
--
-- LABEL IS OPTIONAL NOW. "Sanitation" earns its name because the board has to
-- explain why today is different. A plain Tuesday does not — it is already
-- called Tuesday.

alter table organizations add column if not exists closes_at time;

comment on column organizations.closes_at is
    'Wall-clock time the studio usually stops, in its own timezone. Null means it has not said.';

alter table opening_exceptions add column if not exists closes_at time;
alter table opening_exceptions alter column label drop not null;

alter table opening_exceptions rename to studio_hours;

alter table studio_hours drop constraint if exists opening_exception_says_what_happens;
alter table studio_hours add constraint studio_hours_says_what_happens check (
    (closed and opens_at is null and closes_at is null)
    or (not closed and opens_at is not null)
);

-- One row per scope. Saving the week twice must update, never duplicate, and a
-- partial index is how "one row per weekday, among the weekly ones" is said.
create unique index if not exists studio_hours_one_per_weekday
    on studio_hours (organization_id, weekday)
    where on_date is null and week_of_month is null;

create unique index if not exists studio_hours_one_per_date
    on studio_hours (organization_id, on_date)
    where on_date is not null;

-- And one per NTH weekday. Without this a studio can hold two rules for the
-- last Saturday saying different things; the resolver would still answer
-- deterministically, by whichever was written first, but a settings screen
-- showing the same rule twice is telling the truth about a schema that should
-- not have allowed it.
create unique index if not exists studio_hours_one_per_nth_weekday
    on studio_hours (organization_id, weekday, week_of_month)
    where on_date is null and week_of_month is not null;

drop function if exists studio_opens_at(uuid, date);

-- What hours this studio keeps on this date, and why.
--
-- In Postgres because the question is calendar arithmetic — which occurrence of
-- a weekday a date is, whether the month has run out — and because
-- attendance_local_instant already settled that dates and offsets belong here.
--
-- "Last of its weekday" is the honest test: add seven days and see whether the
-- month changed. No counting, no month-length cases, correct in February.
create or replace function studio_hours_for(p_org uuid, p_date date)
returns table (opens_at time, closes_at time, closed boolean, label text)
language sql
stable
as $$
    select x.opens_at, x.closes_at, x.closed, x.label
    from (
        -- This exact day, named. Nothing outranks a studio pointing at a date.
        select h.opens_at, h.closes_at, h.closed, h.label, 0 as priority, h.created_at
        from studio_hours h
        where h.organization_id = p_org and h.on_date = p_date

        union all

        -- One occurrence of a weekday: the last Saturday, the first Monday.
        select h.opens_at, h.closes_at, h.closed, h.label, 1, h.created_at
        from studio_hours h
        where h.organization_id = p_org
          and h.weekday = extract(isodow from p_date)::smallint
          and h.week_of_month is not null
          and (
              (h.week_of_month = -1
                  and extract(month from p_date + 7) <> extract(month from p_date))
              or (h.week_of_month > 0
                  and ceil(extract(day from p_date) / 7.0) = h.week_of_month)
          )

        union all

        -- The ordinary week.
        select h.opens_at, h.closes_at, h.closed, h.label, 2, h.created_at
        from studio_hours h
        where h.organization_id = p_org
          and h.weekday = extract(isodow from p_date)::smallint
          and h.week_of_month is null
          and h.on_date is null

        union all

        -- Beneath everything, the studio's default. Null still means it has
        -- never said, and nothing is marked late.
        select o.opens_at, o.closes_at, false, null::text, 3, o.created_at
        from organizations o
        where o.id = p_org
    ) x
    order by x.priority, x.created_at
    limit 1;
$$;
