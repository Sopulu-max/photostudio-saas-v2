import { Client } from 'pg';

async function run() {
  const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
  const password = process.env.SUPABASE_PASSWORD;
  
  if (!projectId || !password) return;

  const connectionString = `postgresql://postgres.${projectId}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    
    // Insert test service template
    const res = await client.query(`
      INSERT INTO public.service_templates (
        organization_id, name, pricing, resource_requirements, role_requirements, deliverable_spec, form_schema, status
      ) VALUES (
        'c9e52878-5c9e-4453-a431-cca333d2ba28', 'Test Service', '{}', '{}', '{}', '{}', '[]', 'active'
      ) RETURNING *;
    `);
    console.log('Inserted:', res.rows[0]);
    
  } catch(e) {
    console.error('Insert error:', e);
  } finally {
    await client.end();
  }
}

run();
