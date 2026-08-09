import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const selectQuery = `
  id, name, description, pricing, status, duration_minutes, price_unit, payment_policy, pricing_variant, extra_stages,
  package_services(service:services(
    id, name, domain:service_domains(id, name),
    schema_occasions:service_schema_occasions(occasion:occasions(id, name)),
    schema_contexts:service_schema_contexts(context:service_contexts(id, name)),
    schema_subjects:service_schema_subjects(subject:subjects(id, name)),
    schema_purposes:service_schema_purposes(purpose:purposes(id, name)),
    schema_client_types:service_schema_client_types(client_type:client_types(id, name))
  )),
      package_outputs(output_type:output_types(id, name)),
      package_delivery_containers(container:delivery_containers(id, name)),
      package_workflows(blueprint:blueprints(id, name, stages)),
      package_occasions(occasion:occasions(id, name)),
      package_contexts(context:service_contexts(id, name)),
      package_subjects(subject:subjects(id, name)),
      package_purposes(purpose:purposes(id, name)),
      package_client_types(client_type:client_types(id, name))
  `.replace(/\s+/g, '');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/packages?select=' + selectQuery + '&limit=1';
  const res = await fetch(url, {
    headers: {
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`
    }
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error('Fetch error:', res.status, errorText);
  } else {
    const data = await res.json();
    console.log('Packages query result:', JSON.stringify(data, null, 2));
  }
}

run();
