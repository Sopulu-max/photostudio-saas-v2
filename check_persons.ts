import { Client } from 'pg';

async function run() {
  const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
  const password = process.env.SUPABASE_PASSWORD;
  
  if (!projectId || !password) return;

  const connectionString = `postgresql://postgres.${projectId}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  await client.connect();
  const res = await client.query('SELECT * FROM persons');
  console.log('Persons:', res.rows);
  await client.end();
}

run();
