-- Close the loop between what a package promised and what the client got.
--
-- A Package declares the deliverable types it promises (package_deliverables).
-- A Delivery is a bundle of files handed over. Until now nothing joined them,
-- so the system could not answer "the album is still outstanding" — the
-- commercial plane promised and the production plane produced, in silence.
--
-- A delivery may satisfy more than one promised type (one gallery containing
-- both the edited photos and the album), and a promised type may take more
-- than one delivery (previews now, finals later), so this is many-to-many
-- rather than a column on either side.

create table if not exists delivery_deliverables (
    organization_id uuid not null references organizations(id) on delete cascade,
    delivery_id     uuid not null references deliveries(id) on delete cascade,
    deliverable_id  uuid not null references deliverables(id) on delete cascade,
    created_at      timestamptz not null default now(),
    primary key (delivery_id, deliverable_id)
);

create index if not exists idx_delivery_deliverables_org on delivery_deliverables(organization_id);
create index if not exists idx_delivery_deliverables_deliverable on delivery_deliverables(deliverable_id);

alter table delivery_deliverables enable row level security;
