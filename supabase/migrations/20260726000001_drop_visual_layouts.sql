-- Discard the Visual Engine / page-builder direction.
--
-- The visual page builder (WYSIWYG storefront + service-page designer) has been
-- removed from the application. `visual_layouts` existed solely to persist that
-- builder's block trees (layout_data JSONB) and now has no readers or writers in
-- the codebase. Drop it — along with any policies/constraints that hung off it —
-- so no orphaned tenant data survives the removal.
drop table if exists public.visual_layouts cascade;
