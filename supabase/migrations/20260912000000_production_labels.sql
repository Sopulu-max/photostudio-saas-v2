-- 1. Create service_domain_labels table
create table service_domain_labels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  service_domain_id uuid not null references service_domains(id) on delete cascade,
  name            text not null,
  position        integer not null default 0,
  color           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_service_domain_labels_org on service_domain_labels(organization_id);
create index idx_service_domain_labels_domain on service_domain_labels(service_domain_id);
alter table service_domain_labels enable row level security;
create policy "Tenant Isolation" on service_domain_labels for all using (organization_id in (select auth_org_ids()));

create trigger trg_sd_labels_updated before update on service_domain_labels for each row execute function update_updated_at();

-- 2. Modify booking_lines to hold the current label
alter table booking_lines add column current_label_id uuid references service_domain_labels(id) on delete set null;

-- 3. Update assignments to point to booking_line_id
alter table assignments add column booking_line_id uuid references booking_lines(id) on delete cascade;

update assignments a set booking_line_id = t.booking_line_id
from tasks t where a.task_id = t.id;

-- Some assignments might have been orphaned if they pointed to a task with no booking_line_id (though all tasks should have one). Let's be safe.
delete from assignments where booking_line_id is null;

alter table assignments drop column task_id cascade;
alter table assignments alter column booking_line_id set not null;
create index idx_assignments_line on assignments(booking_line_id);

alter table assignments drop constraint if exists assignments_task_id_employee_id_role_id_key;
alter table assignments add constraint assignments_line_id_employee_id_role_id_key unique (booking_line_id, employee_id, role_id);

-- 4. Update assets to point to booking_line_id
alter table assets add column produced_by_line_id uuid references booking_lines(id) on delete set null;

update assets a set produced_by_line_id = t.booking_line_id
from tasks t where a.produced_by_task_id = t.id;

alter table assets drop column produced_by_task_id;
create index idx_assets_produced_by_line on assets(produced_by_line_id);

-- 5. Drop the old workflow machinery
drop table package_workflows cascade;
drop table tasks cascade;
alter table services drop column if exists default_blueprint_id;
drop table blueprints cascade;
