-- Routing, on top of the Blueprint that already existed: a stage can now
-- suggest which role does it (Team already has roles + employee_roles +
-- assignments.role_id — this was always the missing link, not new machinery)
-- and whether it's front-stage (client present/visible) or back-stage
-- (behind the scenes) — Shostack's service-blueprint distinction, applied to
-- Weave's own Blueprint.
--
-- The role lives on the BLUEPRINT's stages (jsonb, no migration needed there —
-- role_id per stage entry). What needs a real column is the TASK a stage
-- seeds: it should remember what its stage suggested, so the assignment
-- picker can lead with the right person without re-deriving it from the
-- blueprint every time (the blueprint can change after the task exists).
--
-- Suggested, never enforced: a studio can still assign anyone. This is a
-- lead, not a lock — the same progressive-enrichment rule as everywhere else.
alter table tasks add column suggested_role_id uuid references roles(id) on delete set null;
alter table tasks add column is_front_stage boolean;
