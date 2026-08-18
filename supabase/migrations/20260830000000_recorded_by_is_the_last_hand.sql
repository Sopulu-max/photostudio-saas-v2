-- What `recorded_by` actually means.
--
-- It was written once, at check-in, and documented as making a correction
-- traceable — which it could not do, because a correction never touched it. One
-- column cannot attribute three separate actions, so it now means the last hand
-- on the row: check-in, check-out and any adjustment all stamp it.
--
-- The full chain lives where it always did. `events` records checked_in,
-- checked_out and adjusted separately, each with its own actor, so "who did
-- what in what order" is answerable there. This column answers the question a
-- studio actually asks of a row in front of them: who entered this.

comment on column attendance.recorded_by is
    'Contact who last recorded or corrected this row — the operator of the shared device, not the employee. Null for rows written before this was kept. See events for the per-action chain.';
