-- A PACKAGE CAN ASK.
--
-- A question is an element, dragged onto a package beside everything else:
-- the questions differ per package, because a wedding needs the venue and a
-- headshot needs the company, and a single free-text box on the booking form
-- cannot be both.
--
-- WHY THIS IS A KIND and not a `text` element with a flag: the engine does
-- something to an `ask` that it does to nothing else — it renders an input a
-- stranger fills in. That is a distinct act, which is the only thing that
-- earns a kind here.
--
-- `mode` STAYS TWO. A question is 'shown': the studio writes it, now, and it
-- is part of the package. The ANSWER is not the element's content and does
-- not live on it.
--
-- WHERE THE ANSWERS GO IS NOT SETTLED. An earlier version of this migration
-- also created `weave.job_answers`, and wired the public booking form and the
-- bookings screen to it. That work was removed to start bookings over, so
-- this file now carries ONLY the package half: a studio can write the
-- questions, and nothing asks them yet. The table is deliberately absent
-- rather than left standing unused, because an unused table is a liability.
alter table weave.package_elements
  drop constraint if exists package_elements_type_check;

alter table weave.package_elements
  add constraint package_elements_type_check check (
    type in ('deliverable', 'ask', 'picture', 'video', 'text', 'print', 'session')
  );

-- HOW THE ANSWER WILL BE GIVEN. Three renderings the engine performs
-- differently — a line of text, a date, a number — and nothing else. A
-- "choice" with options is deliberately absent until a studio needs one,
-- because options need their own rows.
alter table weave.package_elements
  add column if not exists answer_kind text
    check (answer_kind is null or answer_kind in ('text', 'date', 'number'));

-- A question with nothing written in it is a blank input with no label,
-- which nobody can answer and no studio can read back.
alter table weave.package_elements
  drop constraint if exists package_elements_ask_has_a_question;

alter table weave.package_elements
  add constraint package_elements_ask_has_a_question check (
    type <> 'ask' or (btrim(coalesce(body, '')) <> '' and answer_kind is not null)
  );

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
