-- A studio keeps notes.
--
-- Everything written down in this app so far is written down ABOUT something: a
-- booking's brief, a client's notes, an invoice's notes, an attendance note.
-- Each is a single text column on the row it belongs to, and each exists
-- because that row needed it.
--
-- What a studio has nowhere to put is the rest: ring the framer about 20x30
-- stock, the second shooter is away in June, what to say in the follow-up. Real
-- working memory, belonging to the studio rather than to any one row, and
-- currently living in somebody's phone.
--
-- WHAT A NOTE IS. A body, an author, and when. Everything else is optional,
-- which is progressive enrichment doing what it is for — a note is worth
-- keeping the moment it is typed, and a title it never gets is not a defect.
--
-- WHAT THIS DELIBERATELY IS NOT, YET. Notes are not attached to anything. The
-- events table shows the shape a polymorphic attachment would take here
-- (entity_type + entity_id), and a note about a booking is an obviously useful
-- thing — but a column nothing reads is how this codebase got a jsonb
-- spec_schema that no screen could reach and no query selected. Attaching is
-- its own slice, with its own surface, when it is wanted.

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Who wrote it. A contact, like every other actor in this app; nullable
  -- because a note outlives whoever typed it and losing them must not lose it.
  author_id uuid references contacts(id) on delete set null,
  -- Optional. The list falls back to the first line, which is what a note
  -- called nothing is actually called.
  title text,
  body text not null default '',
  -- The few that should stay at the top. Not a folder, not a tag: a studio with
  -- three notes does not want a filing system, and one with three hundred wants
  -- search, which the body already affords.
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table notes is
  'The studio''s own working memory — what is not about any one booking, client or invoice.';

-- Every read is "this studio's notes, newest or pinned first".
create index if not exists notes_org_recent
  on notes (organization_id, pinned desc, updated_at desc);

notify pgrst, 'reload schema';
