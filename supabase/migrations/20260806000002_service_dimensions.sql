-- Symmetric tagging: Service was only ever classifiable by Domain — the
-- medium. Everything else (Occasion, Subject, Context, Purpose, Client)
-- lived one layer up, on Package. That's the flattening: it made Domain the
-- one dimension allowed to define a real, structured thing, when the actual
-- reason something deserves its own Process is just as often Subject
-- (Real Estate Photography's staging/HDR/turnaround genuinely differs from
-- Landscape) as it is Domain. The test for a new Service stays the same —
-- does it change the process — but now any dimension can be the reason,
-- not just Domain, and a Service stays findable from any of them.
alter table services add column subject_id     uuid references subjects(id) on delete set null;
alter table services add column occasion_id    uuid references occasions(id) on delete set null;
alter table services add column context_id     uuid references service_contexts(id) on delete set null;
alter table services add column purpose_id     uuid references purposes(id) on delete set null;
alter table services add column client_type_id uuid references client_types(id) on delete set null;

-- No longer package-specific — the same five dimensions now apply to
-- Service too, so the studio's choice of which ones it organizes by is
-- one setting, not a Package-only one.
alter table organizations rename column enabled_package_dimensions to enabled_dimensions;
