-- A service can narrow what it produces.
--
-- A deliverable declares what needs settling about it: edited photographs may
-- be softcopy or hardcopy; a print has a size. Those are the possibilities.
--
-- But a service is often narrower than its deliverable. "Digital Retouching"
-- produces edited photographs and only ever as softcopy — that is a fact about
-- the WORK, not about how any package sells it, and until now there was nowhere
-- to say it. Every package bundling that service had to be trusted to pick
-- softcopy, and a client left to choose could pick hardcopy from a service that
-- does not print.
--
-- THE CHAIN THE ONTOLOGY ALREADY DESCRIBES: possibility → restriction → fact.
--
--   deliverable declares   Type: Softcopy or Hardcopy      possibility
--   service narrows        Retouching: Softcopy only       restriction   ← this
--   package fixes          this package: Softcopy          fact
--   or leaves open         the client chooses, from what the service permits
--
-- WHY IT HANGS OFF THE CAPABILITY ROW rather than off (service, variable).
-- service_deliverables already says "this service produces this kind". The
-- narrowing is a qualification of exactly that sentence, so it belongs to that
-- row: remove the capability and the narrowing goes with it, which is correct
-- and needs no separate cleanup.
--
-- A ROW PER PERMITTED VALUE, the same shape service_dimension_values uses for
-- narrowing a classification. No rows means no narrowing — every option the
-- deliverable declares stays available, which is what every existing service
-- means today.

create table if not exists service_deliverable_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- The capability being qualified: this service, producing this kind.
  service_deliverable_id uuid not null references service_deliverables(id) on delete cascade,
  -- Which of the deliverable's declared questions is being narrowed.
  variable_id uuid not null references variables(id) on delete cascade,
  -- One permitted answer. Several rows, several permitted answers.
  value text not null,
  created_at timestamptz not null default now(),
  unique (service_deliverable_id, variable_id, value)
);

comment on table service_deliverable_options is
  'What a service permits for a deliverable''s declared question. Absent means every declared option stays available.';

create index if not exists service_deliverable_options_lookup
  on service_deliverable_options (service_deliverable_id, variable_id);

create index if not exists service_deliverable_options_org
  on service_deliverable_options (organization_id);

notify pgrst, 'reload schema';
