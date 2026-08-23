import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function test() {
  const orgId = '75d8b8e0-bb82-4aa8-ad69-b5413ed458eb'; // assuming this is the org, we can get it from the db
  
  const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
  const org = orgs?.[0]?.id;

  const { data: packages } = await supabase
    .from('packages')
    .select(`
      id, name, description, status, duration_minutes,
      package_services(id, position, service:services(
        id, name, service_domain_id, domain:service_domains(name),
        service_dimension_values(dimension_value:dimension_values(
          id, name, dimension:dimensions(id, name, position)
        ))
      ), package_service_dimension_values(dimension_value:dimension_values(
        id, name, dimension:dimensions(id, name, position)
      )))
    `)
    .eq('organization_id', org)
    .eq('status', 'active');

  console.log(`Found ${packages?.length} active packages in DB.`);

  for (const p of packages || []) {
    console.log(`Package: ${p.name}`);
    const services = p.package_services.map((ps: any) => ps.service.name);
    console.log(`  Services: ${services.join(', ')}`);
    const domains = [...new Set(p.package_services.map((ps: any) => ps.service.domain?.name))];
    console.log(`  Domains: ${domains.join(', ')}`);
    const narrowings = p.package_services.flatMap((ps: any) => ps.package_service_dimension_values).map((v: any) => v.dimension_value?.name);
    console.log(`  Narrowings: ${narrowings.join(', ')}`);
  }
}

test().catch(console.error);
