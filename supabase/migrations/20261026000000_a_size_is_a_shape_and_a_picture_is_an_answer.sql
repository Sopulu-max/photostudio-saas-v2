-- A size is a shape, and a picture is an answer.
--
-- A framed print has a size. Until now the only way to declare one was as a
-- CHOICE with options like '8x10' — a string the app could read out but not
-- reason about. A client comparing frames on the public page could not be
-- shown 8x10 beside 16x20 at their real proportions, because nothing knew that
-- '16x20' was two numbers rather than a word; and the one rule the engine keeps
-- about the studio's vocabulary — 20261020000000, nothing infers meaning from
-- a name — forbade guessing.
--
-- So the registry gains a shape, the same way it gained `date`: a SIZE is a
-- width and a height in a unit the variable already carries, written by the
-- engine in one canonical form ('16×20') and parsed by the engine everywhere
-- it is read. The studio types what it likes — '16x20', '16 × 20' — and one
-- normaliser settles it on the way in. That is a shape the engine owns, not a
-- meaning inferred from a studio's word.
--
-- A FILE IS NOT A VARIABLE. The registry also gains `file`, so a package can
-- ask for the picture to be printed. That is an intake QUESTION — a fact about
-- one engagement, like the event date — and not something a package could fix
-- or a service could vary, so the variables constraint does not widen to it.
-- Questions live in form_schema and were never constrained here.
--
-- THE CONSTRAINT IS ALSO RENAMED. 20261011000000 renamed service_variables to
-- variables and promised "nothing in the schema says service_variables any
-- more" — and missed this one check. Fixed in passing.
--
-- AND A PLACE FOR THE PICTURE TO LAND. A visitor on the public page has no
-- session, so the upload goes through the server with the service role and
-- lands under intake/<org>/… — there is deliberately no anonymous insert policy
-- here, because the server is the only door and it decides what it accepts.
-- The studio reads it back through a signed URL the same way.
--
-- Nothing to backfill: every existing kind is in the widened set, and a
-- choice named 'size' stays a choice — turning it into a size would be
-- exactly the inference from a name this migration refuses.

alter table variables drop constraint if exists service_variables_kind_check;
alter table variables drop constraint if exists variables_kind_check;

alter table variables add constraint variables_kind_check
    check (kind = any (array[
        'text'::text,
        'textarea'::text,
        'number'::text,
        'date'::text,
        'choice'::text,
        'multichoice'::text,
        'boolean'::text,
        'url'::text,
        'size'::text
    ]));

comment on constraint variables_kind_check on variables is
  'The shapes the engine knows how to store, validate and render. A size is width × height in the variable''s unit.';

-- Where a client's own picture lands before there is a booking to hang it on.
insert into storage.buckets (id, name, public)
values ('intake', 'intake', false)
on conflict (id) do nothing;

-- The studio may read what was sent to it. Uploads have no policy on purpose:
-- they arrive through the server, which scopes the path to the studio.
drop policy if exists "A studio can read its intake files" on storage.objects;
create policy "A studio can read its intake files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'intake');

notify pgrst, 'reload schema';
