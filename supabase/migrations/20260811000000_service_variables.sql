-- Service Variables — the half of the Configuration Schema that was never built.
--
-- A service's schema declares two different kinds of variation:
--
--   dimensions  shared, structured vocabulary  Occasion: Wedding, Context: Studio
--   variables   per-service quantities         Outfits: 2, Edited images: 5
--
-- Only dimensions existed. So a package could say "this is for weddings" but not
-- "this includes 2 outfits and 5 edited images" — which is most of what a studio
-- actually sells. Those numbers lived as free text inside a package's form_schema
-- JSON, unqueryable and unvalidated.
--
-- The same rule as dimensions applies: the SERVICE declares what may vary, the
-- PACKAGE selects a value. A package never invents a variable the service does
-- not recognize.

CREATE TABLE IF NOT EXISTS service_variables (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    service_id      uuid not null references services(id) on delete cascade,

    -- Stable machine name ('outfits'); label is what a human reads.
    key             text not null,
    label           text not null,

    -- number  → a quantity, optionally bounded and carrying a unit
    -- choice  → one of `options`
    -- boolean → yes/no
    -- text    → free text, for the cases the others cannot hold
    kind            text not null default 'number'
                    check (kind in ('number', 'choice', 'boolean', 'text')),

    -- 'hours', 'images', 'outfits' — renders as "2 outfits", never bare "2".
    unit            text,
    options         jsonb not null default '[]'::jsonb,
    default_value   jsonb,
    min_value       numeric,
    max_value       numeric,

    position        integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    unique (service_id, key)
);

CREATE INDEX IF NOT EXISTS idx_service_variables_service on service_variables(service_id, position);

ALTER TABLE service_variables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON service_variables
  FOR ALL USING (organization_id IN (SELECT auth_org_ids()));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON service_variables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- What a package fixes. A variable left unset here is deliberately open — it
-- stays a question for the client rather than part of the package's scope.
CREATE TABLE IF NOT EXISTS package_variable_values (
    organization_id     uuid not null references organizations(id) on delete cascade,
    package_id          uuid not null references packages(id) on delete cascade,
    service_variable_id uuid not null references service_variables(id) on delete cascade,

    -- jsonb so one column holds a number, a string, or a boolean without
    -- three nullable columns and a discriminator.
    value               jsonb not null,

    PRIMARY KEY (package_id, service_variable_id)
);

CREATE INDEX IF NOT EXISTS idx_package_variable_values_pkg on package_variable_values(package_id);

ALTER TABLE package_variable_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON package_variable_values
  FOR ALL USING (organization_id IN (SELECT auth_org_ids()));
