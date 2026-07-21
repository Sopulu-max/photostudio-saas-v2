import { NextResponse } from 'next/server';
import { Client } from 'pg';

const sql = `
-- ============================================================
-- LEVEL 3: WORKFLOW TEMPLATES
-- ============================================================
create table if not exists workflow_templates (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references organizations(id),
  name                text not null,
  stages              jsonb not null default '[]',
  status              text not null default 'active'
                        check (status in ('active', 'retired')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_wt_org on workflow_templates(organization_id);

-- ============================================================
-- LEVEL 3: SERVICE TEMPLATES
-- ============================================================
create table if not exists service_templates (
  id                    uuid primary key default uuid_generate_v4(),
  organization_id       uuid not null references organizations(id),
  name                  text not null,
  default_workflow_template_id uuid references workflow_templates(id),
  pricing               jsonb not null default '{}',
  resource_requirements jsonb default '{}',
  role_requirements     jsonb default '{}',
  deliverable_spec      jsonb default '{}',
  status                text not null default 'active'
                          check (status in ('active', 'retired')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_st_org on service_templates(organization_id);

-- ============================================================
-- LEVEL 3: VISUAL LAYOUTS
-- ============================================================
create table if not exists visual_layouts (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id),
  context           text not null,
  name              text,
  layout_data       jsonb not null default '{}',
  status            text not null default 'draft'
                      check (status in ('draft', 'published')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  published_at      timestamptz
);
create index if not exists idx_vl_org on visual_layouts(organization_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
drop trigger if exists trg_wt_updated on workflow_templates;
create trigger trg_wt_updated before update on workflow_templates for each row execute function update_updated_at();

drop trigger if exists trg_st_updated on service_templates;
create trigger trg_st_updated before update on service_templates for each row execute function update_updated_at();

drop trigger if exists trg_vl_updated on visual_layouts;
create trigger trg_vl_updated before update on visual_layouts for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table workflow_templates enable row level security;
alter table service_templates enable row level security;
alter table visual_layouts enable row level security;

drop policy if exists "Tenant Isolation" on workflow_templates;
create policy "Tenant Isolation" on workflow_templates for all using (organization_id = auth_org_id());

drop policy if exists "Tenant Isolation" on service_templates;
create policy "Tenant Isolation" on service_templates for all using (organization_id = auth_org_id());

drop policy if exists "Tenant Isolation" on visual_layouts;
create policy "Tenant Isolation" on visual_layouts for all using (organization_id = auth_org_id());
`;

export async function GET() {
  try {
    const connectionString = `postgresql://postgres:${process.env.SUPABASE_PASSWORD}@db.${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}.supabase.co:5432/postgres`;
    
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    await client.query(sql);
    await client.end();

    return NextResponse.json({ success: true, message: 'Migration executed successfully.' });
  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
