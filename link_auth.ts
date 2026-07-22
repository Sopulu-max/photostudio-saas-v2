import { Client } from 'pg';

async function run() {
  const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
  const password = process.env.SUPABASE_PASSWORD;
  
  if (!projectId || !password) return;

  const connectionString = `postgresql://postgres.${projectId}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    
    // Link persons to auth.users by email
    const res = await client.query(`
      UPDATE public.persons p
      SET auth_user_id = u.id
      FROM auth.users u
      WHERE p.email = u.email
        AND p.auth_user_id IS NULL;
    `);
    console.log(`Linked ${res.rowCount} persons to auth.users.`);
    
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
