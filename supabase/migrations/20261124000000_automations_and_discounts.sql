-- Sales automations: the messages a studio means to send and never does.
--
-- Three triggers, and three is the whole list, because the ENGINE computes
-- something different for each one. That is the only thing that earns a fixed
-- value here; everything a studio writes is its own words.
--
--   gallery_shared    N days after a gallery was sent
--   gallery_expiring  N days before it closes
--   kept_not_bought   N days after somebody kept frames and bought nothing
--
-- The third is the one that earns its keep commercially: a client who marked
-- favourites and ordered nothing has already told you what they want.
--
-- NOTHING IS SENT FROM HERE. No mail provider is wired, and rather than stub
-- one, what is due is surfaced in the app with the message already composed, so
-- the studio can act on it today. When a provider arrives it fills in
-- `sent_at` on the same rows and nothing else about this changes.

create table weave.discounts (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references weave.studios(id) on delete cascade,
  code        text not null check (btrim(code) <> ''),
  kind        text not null check (kind in ('percent', 'amount')),
  -- Percent is whole points (10 = 10%); amount is minor units, like every
  -- other figure in this system.
  value       bigint not null check (value > 0),
  expires_on  date,
  max_uses    integer check (max_uses is null or max_uses > 0),
  times_used  integer not null default 0 check (times_used >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- One meaning per code within a studio. Two live codes spelt the same is a
  -- dispute with a client waiting to happen.
  unique (studio_id, code)
);
create index discounts_studio on weave.discounts(studio_id);

create table weave.automations (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references weave.studios(id) on delete cascade,
  name         text not null check (btrim(name) <> ''),
  trigger      text not null
                 check (trigger in ('gallery_shared', 'gallery_expiring', 'kept_not_bought')),
  after_days   integer not null default 3 check (after_days >= 0 and after_days <= 365),
  subject      text not null check (btrim(subject) <> ''),
  body         text not null check (btrim(body) <> ''),
  discount_id  uuid references weave.discounts(id) on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index automations_studio on weave.automations(studio_id, active);

-- ONE ROW PER AUTOMATION PER GALLERY PER PERSON, and the uniqueness is the
-- whole point: without it a studio nags the same client every time the page is
-- opened, which is worse than never writing to them at all.
create table weave.automation_sends (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references weave.studios(id) on delete cascade,
  automation_id  uuid not null references weave.automations(id) on delete cascade,
  gallery_id     uuid not null references weave.galleries(id) on delete cascade,
  person_id      uuid not null references weave.people(id) on delete cascade,
  due_at         timestamptz not null,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  unique (automation_id, gallery_id, person_id)
);
create index automation_sends_due
  on weave.automation_sends(studio_id, sent_at, due_at);

-- What a client was given, kept with the order rather than only on the code, so
-- re-pricing or deleting a code cannot rewrite what somebody was charged.
alter table weave.orders
  add column if not exists discount_code text,
  add column if not exists discount_off bigint not null default 0
    check (discount_off >= 0);

create trigger discounts_touch before update on weave.discounts
  for each row execute function weave.touch_updated_at();
create trigger automations_touch before update on weave.automations
  for each row execute function weave.touch_updated_at();

alter table weave.discounts        enable row level security;
alter table weave.automations      enable row level security;
alter table weave.automation_sends enable row level security;

grant all on weave.discounts        to anon, authenticated, service_role;
grant all on weave.automations      to anon, authenticated, service_role;
grant all on weave.automation_sends to anon, authenticated, service_role;

notify pgrst, 'reload schema';
