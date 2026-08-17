-- A variable and an intake question are the same question, asked twice.
--
-- `service_variables.kind` allowed four shapes — number, choice, boolean, text
-- — while `FIELD_TYPES`, the registry intake questions have always used, holds
-- eight and gives each one validation, storage and display. Two registries for
-- one concept, and the variables one was the stub: a variable could not be a
-- date, a multi-select or a URL, for no reason anyone wrote down.
--
-- This widens the constraint to the registry both now share. Still bounded, and
-- deliberately so: a kind decides how a value is stored, validated and
-- rendered, so an open one is an unrenderable one. The engine owns the shapes;
-- the studio owns the vocabulary. What changes is that there is one list of
-- shapes instead of two.
--
-- Nothing to backfill — all four existing kinds are in the new set.

alter table service_variables drop constraint if exists service_variables_kind_check;

alter table service_variables add constraint service_variables_kind_check
    check (kind = any (array[
        'text'::text,
        'textarea'::text,
        'number'::text,
        'date'::text,
        'choice'::text,
        'multichoice'::text,
        'boolean'::text,
        'url'::text
    ]));
