-- Two classes of variable, and which one this is said out loud.
--
-- A service declares what varies about it. A package then does one of two
-- things with each: it fixes a value — two outfits, four hours — and that
-- becomes part of the offer; or it deliberately leaves the answer to the
-- client, and the question is asked at booking. Both are decisions, and a
-- studio makes them one variable at a time.
--
-- WHAT WAS WRONG. Only the first was recorded. "Open to the client" was not
-- stored at all; it was inferred from the absence of a fixed value, so a
-- deliberate question and a variable nobody had got round to were the same
-- state. The consequence was live and invisible: because every unfixed variable
-- was asked, declaring a new variable on a service instantly added a new
-- question to the public booking form of every package built on that service,
-- with nobody having decided anything. A studio adding "outfits" while building
-- a Deluxe package changed what its Basic package asks strangers on the
-- internet.
--
-- So a row now exists for both answers, and says which it is. No row means the
-- studio has not decided yet, and an undecided variable is asked of nobody —
-- an unfinished package rather than a question by default.
alter table package_variable_values alter column value drop not null;

alter table package_variable_values
  add column if not exists answered_by text not null default 'studio';

-- Every row that already exists is a value the studio fixed, which the default
-- already says. What has to be written is the other class: every variable a
-- package leaves unfixed is, TODAY, asked of the client — so it is recorded as
-- asked, and nothing a studio has published changes shape under it. The new
-- rule starts applying to decisions made from here.
insert into package_variable_values (organization_id, package_service_id, service_variable_id, value, answered_by)
select ps.organization_id, ps.id, sv.id, null, 'client'
from package_services ps
join service_variables sv on sv.service_id = ps.service_id
where not exists (
  select 1 from package_variable_values existing
  where existing.package_service_id = ps.id
    and existing.service_variable_id = sv.id
);

alter table package_variable_values
  drop constraint if exists package_variable_values_answered_by_check;
alter table package_variable_values
  add constraint package_variable_values_answered_by_check
  check (
    (answered_by = 'studio' and value is not null)
    or (answered_by = 'client' and value is null)
  );

comment on column package_variable_values.answered_by is
  'studio: the package fixes this value. client: the package asks it at booking. No row at all: nobody has decided, and it is asked of no one.';
