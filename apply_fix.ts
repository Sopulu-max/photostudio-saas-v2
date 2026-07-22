import { Client } from 'pg';
import fs from 'fs';

async function run() {
  const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
  const password = process.env.SUPABASE_PASSWORD;
  
  if (!projectId || !password) return;

  const connectionString = `postgresql://postgres.${projectId}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    const sql = fs.readFileSync('supabase/migrations/20260721000008_service_template_fix.sql', 'utf-8');
    await client.query(sql);
    console.log('Migration applied successfully.');
    
    // Check if PostgREST cache needs reloading
    await client.query('NOTIFY pgrst, \'reload schema\'');
    console.log('PostgREST schema cache reloaded.');
  } catch(e) {
    console.error('Migration error:', e);
  } finally {
    await client.end();
  }
}

run();
