import { Client } from 'pg';
import fs from 'fs/promises';
import path from 'path';

async function run() {
  const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
  const password = process.env.SUPABASE_PASSWORD;
  
  if (!projectId || !password) {
    console.error('Missing credentials');
    return;
  }

  const connectionString = `postgresql://postgres.${projectId}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    const files = await fs.readdir(migrationsDir);
    
    // We only want to run migrations created by us starting from 2026...
    // 001_kernel_schema is already applied.

    // Pre-create the auth_user_id column and auth_org_ids function so earlier migrations don't fail
    await client.query(`
      ALTER TABLE persons 
      ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

      CREATE OR REPLACE FUNCTION auth_org_ids()
      RETURNS SETOF UUID AS $$
        SELECT organization_id FROM persons WHERE auth_user_id = auth.uid();
      $$ LANGUAGE sql STABLE;
    `);

    const migrationsToRun = files
      .filter(f => f === '20260721000007_schema_corrections.sql')
      .sort();

    for (const file of migrationsToRun) {
      console.log(`Running migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, 'utf8');
      await client.query(sql);
      console.log(`Successfully applied ${file}`);
    }

    console.log('All migrations applied successfully!');
  } catch (err) {
    console.error('DB Error:', err);
  } finally {
    await client.end();
  }
}

run();
