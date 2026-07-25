-- 20260725000001_service_pages_foundation.sql
-- Foundation for Milestone 1 ("my first sellable page"), per
-- docs/architecture/RECONCILIATION.md §6. Additive and non-destructive.
--
-- Decision A: a Service holds its own page content as DATA (one body of truth),
-- so a service page can bind to real images and description, and the same
-- content can be reused in listings, the storefront, etc.
--
-- Extend-in-place: a visual layout can belong to a specific subject (e.g. a
-- service), the first concrete step toward generalizing visual_layouts -> view_defs.

-- 1. Service page content, as data (Decision A)
alter table service_templates add column if not exists description text;
alter table service_templates add column if not exists media jsonb not null default '[]';
-- media = ordered array of { url: text, alt?: text, kind: 'image' | 'video' }

-- 2. A layout can belong to a subject (extend-in-place toward view_defs)
alter table visual_layouts add column if not exists subject_type text;
alter table visual_layouts add column if not exists subject_id uuid;
-- e.g. subject_type = 'service', subject_id = <service_templates.id>.
-- Existing storefront rows leave both null (they belong to the org, not a subject).

create index if not exists idx_vl_subject
  on visual_layouts (organization_id, context, subject_id);
