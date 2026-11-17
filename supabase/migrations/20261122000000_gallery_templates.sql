-- Templates carry the reusable presentation of a gallery, never a job's
-- photos, visitors, access code, or history. Those facts belong to the one
-- gallery where they happened.
create table weave.gallery_templates (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references weave.studios(id) on delete cascade,
  name          text not null check (btrim(name) <> ''),
  may_download  boolean not null default true,
  price_list_id uuid references weave.price_lists(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index gallery_templates_studio on weave.gallery_templates(studio_id, created_at);
create trigger gallery_templates_touch before update on weave.gallery_templates
  for each row execute function weave.touch_updated_at();

create table weave.gallery_template_sections (
  id                 uuid primary key default gen_random_uuid(),
  template_id        uuid not null references weave.gallery_templates(id) on delete cascade,
  name               text not null check (btrim(name) <> ''),
  position           integer not null default 0,
  visible_to_clients boolean not null default true,
  created_at         timestamptz not null default now()
);
create index gallery_template_sections_template on weave.gallery_template_sections(template_id, position);

alter table weave.gallery_templates enable row level security;
alter table weave.gallery_template_sections enable row level security;
grant all on weave.gallery_templates to anon, authenticated, service_role;
grant all on weave.gallery_template_sections to anon, authenticated, service_role;

notify pgrst, 'reload schema';
