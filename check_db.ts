import { Client } from 'pg';

async function run() {
  const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
  const password = process.env.SUPABASE_PASSWORD;
  
  if (!projectId || !password) return;

  const connectionString = `postgresql://postgres.${projectId}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    
    console.log('--- Services ---');
    const s = await client.query('SELECT name, organization_id FROM service_templates');
    console.log(s.rows);

    console.log('--- Workflows ---');
    const w = await client.query('SELECT name, organization_id FROM workflow_templates');
    console.log(w.rows);
    
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
