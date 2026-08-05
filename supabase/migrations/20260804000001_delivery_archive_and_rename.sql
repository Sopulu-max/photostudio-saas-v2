-- Archiving a delivery is the studio's own bookkeeping ("this one's
-- superseded by the final gallery") — independent of whether it's shared.
-- deliveries.status already means draft/shared (toggled by share/unshare);
-- archived can't be a third value of that same column without losing
-- whether an archived delivery was shared or not. A separate nullable
-- timestamp keeps the two concerns apart: archiving never touches access,
-- unsharing never touches archive state.

alter table deliveries add column archived_at timestamptz;
