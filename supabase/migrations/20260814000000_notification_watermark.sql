-- In-app notifications, without a notifications table.
--
-- A notification is not a new fact. Every one of them is an event the system
-- already recorded, with its actor, its entity and its payload. Storing them
-- again would create a second source of truth that drifts from the first.
--
-- What is genuinely per-operator is whether *you* have seen them, so that is
-- the only thing stored: a watermark on the acting contact. Two people in the
-- same studio see the same facts and carry their own unread counts.
--
-- The cost of a watermark instead of per-item read rows is that you cannot
-- dismiss one notification while leaving an older one unread. That is a real
-- limitation and a deliberate one — per-item state is a write on every glance,
-- and no studio has asked to read its inbox out of order.

alter table contacts
    add column if not exists notifications_seen_at timestamptz;

-- Existing operators start with everything already seen. The alternative is
-- greeting every studio with a count of every event since their studio was
-- created, which is noise, not news.
update contacts
set notifications_seen_at = now()
where auth_user_id is not null
  and notifications_seen_at is null;

-- The feed reads events by org, newest first, filtered to a handful of
-- actions. Without this it is a full scan of organizational memory on every
-- page load, since the dashboard chrome is force-dynamic.
create index if not exists idx_events_org_created_at
    on events(organization_id, created_at desc);
