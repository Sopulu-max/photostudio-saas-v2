-- Days the studio does not open as usual.
--
-- `organizations.opens_at` said one time, every day forever, and no studio
-- works that way. The case that surfaced it: in Nigeria the last Saturday of
-- the month is sanitation, and businesses open at 10:00. But there is nothing
-- special about sanitation from this system's point of view — it is one
-- instance of a shape that also covers "Saturdays we open at ten", "closed
-- Sundays", "closed on Christmas Day". A studio in Lagos that works through
-- sanitation must be able to say so, and a studio in Toronto must never be
-- told about it at all. So the RULE is modelled and the custom is not.
--
-- WHY NOT A COLUMN PER DAY. Seven opening times would answer "Saturdays we
-- open at ten" and nothing else — not the last Saturday, not a public holiday,
-- not one Tuesday the power is out. This is the same question every time: on
-- days matching X, the studio opens at T, or not at all.
--
-- TWO SCOPES, ONE FACT. An exception either names a DATE (Christmas, one
-- Tuesday) or a WEEKDAY, optionally narrowed to which occurrence in the month
-- (-1 = last, 1..5 = first..fifth, null = every). Both answer "what does this
-- studio do on this day", so they live together and are resolved together;
-- splitting them would mean asking two questions to get one answer.
--
-- PRECEDENCE IS SPECIFICITY. A named date beats a rule about the last Saturday,
-- which beats a rule about every Saturday, which beats the studio's ordinary
-- time. Ties break on which was written first, so the answer never depends on
-- the order rows come back in.
--
-- WHAT THIS IS NOT. Not a per-person schedule — employees.working_days already
-- says which days are theirs, and that is a different fact. This is the
-- studio's own day. When the studio is closed, nobody is expected and nobody is
-- late, whatever their working days say.

create table if not exists opening_exceptions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,

    -- What to call it on screen. A time that differs from the usual one is
    -- confusing until it says why, so the board names the reason.
    label text not null,

    -- Exactly one of these two scopes.
    on_date date,
    weekday smallint,
    -- Which occurrence of that weekday. -1 = last in the month, 1..5 = the
    -- nth, null = every one of them.
    week_of_month smallint,

    -- The effect: a different opening time, or shut.
    opens_at time,
    closed boolean not null default false,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- A date OR a weekday, never both and never neither.
    constraint opening_exception_has_one_scope check (
        (on_date is not null and weekday is null and week_of_month is null)
        or (on_date is null and weekday between 1 and 7)
    ),
    constraint opening_exception_week_is_real check (
        week_of_month is null or week_of_month = -1 or week_of_month between 1 and 5
    ),
    -- Shut, or open at a stated time. "Open, but who knows when" is not an
    -- exception anyone can act on.
    constraint opening_exception_says_what_happens check (
        (closed and opens_at is null) or (not closed and opens_at is not null)
    )
);

create index if not exists opening_exceptions_org_idx on opening_exceptions (organization_id);

alter table opening_exceptions enable row level security;

drop policy if exists "Tenant Isolation" on opening_exceptions;
create policy "Tenant Isolation" on opening_exceptions
    for select using (organization_id in (select auth_org_ids()));

-- What time this studio opens on this date, and why.
--
-- In Postgres because the whole question is calendar arithmetic — which
-- occurrence of a weekday a date is, whether a month has run out — and because
-- attendance_local_instant already established that dates and offsets are
-- settled here rather than in JavaScript. The caller asks once per board.
--
-- "Last of its weekday" is the honest test: add seven days and see whether the
-- month changed. No counting, no month-length special cases, correct in
-- February.
create or replace function studio_opens_at(p_org uuid, p_date date)
returns table (opens_at time, closed boolean, label text)
language sql
stable
as $$
    select x.opens_at, x.closed, x.label
    from (
        -- This exact day, named. Nothing outranks a studio pointing at a date.
        select e.opens_at, e.closed, e.label, 0 as priority, e.created_at
        from opening_exceptions e
        where e.organization_id = p_org and e.on_date = p_date

        union all

        -- One occurrence of a weekday: the last Saturday, the first Monday.
        select e.opens_at, e.closed, e.label, 1, e.created_at
        from opening_exceptions e
        where e.organization_id = p_org
          and e.weekday = extract(isodow from p_date)::smallint
          and e.week_of_month is not null
          and (
              (e.week_of_month = -1
                  and extract(month from p_date + 7) <> extract(month from p_date))
              or (e.week_of_month > 0
                  and ceil(extract(day from p_date) / 7.0) = e.week_of_month)
          )

        union all

        -- Every occurrence of a weekday: "Saturdays we open at ten."
        select e.opens_at, e.closed, e.label, 2, e.created_at
        from opening_exceptions e
        where e.organization_id = p_org
          and e.weekday = extract(isodow from p_date)::smallint
          and e.week_of_month is null

        union all

        -- The ordinary day. Null here still means the studio has never said
        -- when it opens, and nothing is marked late.
        select o.opens_at, false, null::text, 3, o.created_at
        from organizations o
        where o.id = p_org
    ) x
    order by x.priority, x.created_at
    limit 1;
$$;
