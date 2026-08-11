-- What the client actually chose.
--
-- The chain was declared but never finished:
--
--   service   declares what may vary        outfits, coverage hours
--   package   fixes some of it              "2 outfits" — the offer
--   booking   answers whatever is left      "…and 6 hours" — the engagement
--
-- Only the first two existed. A package could leave "hours of coverage" open,
-- but there was nowhere to put the answer, so the open variable was a promise
-- the system could not keep.
--
-- This hangs off the LINE, not the booking: a booking may carry two lines from
-- different packages, each with its own outfit count, and the line is already
-- the production unit that tasks and assets attach to.

CREATE TABLE IF NOT EXISTS booking_line_variable_values (
    organization_id     uuid not null references organizations(id) on delete cascade,
    booking_line_id     uuid not null references booking_lines(id) on delete cascade,
    service_variable_id uuid not null references service_variables(id) on delete cascade,

    -- jsonb for the same reason as package_variable_values: one column holds a
    -- number, a string or a boolean without a discriminator.
    value               jsonb not null,

    -- Where the answer came from. A value inherited from the package is the
    -- studio's offer; one the client gave is theirs. Keeping them apart means a
    -- studio can see what was actually asked rather than assuming.
    source              text not null default 'client'
                        check (source in ('package', 'client', 'studio')),

    created_at          timestamptz not null default now(),

    PRIMARY KEY (booking_line_id, service_variable_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_line_variable_values_line
  ON booking_line_variable_values(booking_line_id);

ALTER TABLE booking_line_variable_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON booking_line_variable_values
  FOR ALL USING (organization_id IN (SELECT auth_org_ids()));
