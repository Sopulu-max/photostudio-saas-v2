-- THE HOURS OF A WHOLE MONTH, IN ONE QUESTION.
--
-- studio_hours_for answers for one date, and the precedence between a named
-- date, an nth weekday, the ordinary week and the studio's default is written
-- there, once. The calendar needs the answer for every day it draws, and asked
-- day by day: thirty-five round trips to draw one month, which put twenty-six
-- to fifty-six seconds of waiting in front of a page whose own work took one.
--
-- This asks the same question for a span of days in a single call. It CALLS
-- studio_hours_for rather than restating it, so there is still one place where
-- the precedence lives and no second copy to disagree with it.
create or replace function studio_hours_in_range(p_org uuid, p_from date, p_to date)
returns table (on_day date, opens_at time, closes_at time, closed boolean, label text)
language sql
stable
as $$
    select d::date as on_day, h.opens_at, h.closes_at, h.closed, h.label
    from generate_series(p_from, p_to, interval '1 day') as d
    cross join lateral studio_hours_for(p_org, d::date) as h;
$$;

comment on function studio_hours_in_range(uuid, date, date) is
  'The hours a studio keeps on each day of a span, resolved by studio_hours_for so the precedence stays written once. One call per calendar, not one per day.';
