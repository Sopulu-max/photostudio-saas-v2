-- Which days a person is even meant to be here.
--
-- Attendance records what happened. Without what was EXPECTED it can't mean
-- much: a board that files everyone under "not in yet" says a person on their
-- day off is late. Expected and actual are a pair, and only one of them existed.
--
-- A COLUMN, NOT A TABLE. There are seven days and there will always be seven;
-- the set is closed by the calendar rather than by anyone's opinion, nothing
-- ever points at a weekday, and the pattern is always read whole. That is
-- exactly when an array is right and a table is ceremony — the same reasoning
-- that makes a variable's `options` an array while `dimension_values` is a
-- table, because a studio invents dimension values and cannot invent a Tuesday.
--
-- ISO 8601 numbering: 1 = Monday … 7 = Sunday. Matching the standard rather
-- than JavaScript's 0 = Sunday, because the database is where this is stored
-- and `extract(isodow)` speaks ISO.
--
-- EMPTY MEANS UNKNOWN, NOT "WORKS NOTHING". A studio that has never said
-- anything about someone's week should see them treated exactly as before —
-- possibly in, never wrongly marked off. Progressive enrichment: the record is
-- useful with nothing filled in and gets sharper when told more.
--
-- What this deliberately does NOT hold: leave, public holidays, a swapped
-- Saturday. Those are dated exceptions to this pattern, a different fact with a
-- different shape, and folding them in here would mean a recurring rule that is
-- somehow also a one-off.

alter table employees add column if not exists working_days smallint[] not null default '{}';

comment on column employees.working_days is
    'ISO weekdays this person normally works: 1=Mon … 7=Sun. Empty means never stated — treated as possibly working, never as off.';

alter table employees drop constraint if exists employees_working_days_are_weekdays;

alter table employees add constraint employees_working_days_are_weekdays
    check (
        working_days <@ array[1,2,3,4,5,6,7]::smallint[]
        and array_length(working_days, 1) is distinct from 0
    );
