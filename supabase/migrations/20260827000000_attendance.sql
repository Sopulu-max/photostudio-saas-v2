-- Who actually turned up.
--
-- The first fact this system holds about a person that is not planned work.
-- `assignments` says who is meant to do something; `tasks` says what is to be
-- done. Neither says anyone was ever in the building. Presence is genuinely new,
-- so it gets a table — the test being "is there an edge that already holds this",
-- and there isn't.
--
-- ONE ROW PER PERSON PER WORKING DAY. Arrival opens it, leaving stamps it, and
-- the day's span is first arrival to last leaving. Someone who checks in again
-- after checking out is simply back — `checked_out_at` clears rather than a
-- second row appearing, because the studio asked for arrival and leaving, not a
-- punch stream. If breaks ever need to be separate, that is a new row shape, not
-- a nullable column bolted onto this one.
--
-- WHY work_date IS STORED RATHER THAN DERIVED. "Who is in today" needs a day
-- boundary, and a day boundary is a fact about the studio, not about UTC. A 9pm
-- check-in in Lagos is the same working day as a 9am one; derived in UTC it
-- might not be. The date is resolved in the studio's timezone at check-in and
-- frozen — a studio that later corrects its timezone should not have last
-- month's attendance silently move.

alter table organizations add column if not exists timezone text not null default 'UTC';

comment on column organizations.timezone is
    'IANA zone. Decides where one working day ends and the next begins — see attendance.work_date.';

create table if not exists attendance (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,

    -- The studio's working day this belongs to, resolved at check-in.
    work_date date not null,

    checked_in_at timestamptz not null default now(),
    checked_out_at timestamptz,

    -- Who tapped, when it wasn't the person themselves. A shared device at the
    -- door means anyone can tap any name; recording the operator makes a
    -- correction traceable rather than anonymous.
    recorded_by uuid references contacts(id) on delete set null,
    note text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- One day, one record. This is what makes "check in" idempotent: tapping
    -- twice cannot produce two mornings.
    unique (organization_id, employee_id, work_date),

    -- You cannot leave before you arrived.
    constraint attendance_leaves_after_arriving
        check (checked_out_at is null or checked_out_at >= checked_in_at)
);

-- The two questions this table exists to answer: who is in today, and what days
-- has this person worked.
create index if not exists attendance_org_date_idx on attendance (organization_id, work_date desc);
create index if not exists attendance_employee_idx on attendance (employee_id, work_date desc);

alter table attendance enable row level security;

drop policy if exists "Tenant Isolation" on attendance;
create policy "Tenant Isolation" on attendance
    for select using (organization_id in (select auth_org_ids()));
