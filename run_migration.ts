import fs from 'fs';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Direct connection string to Supabase DB (bypassing IPv4 pooler issues if any)
const connectionString = `postgresql://postgres:${process.env.SUPABASE_PASSWORD}@db.qvscrdunkqkiswxvxbbm.supabase.co:5432/postgres`;

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to Supabase DB');
    
    // Read the SQL file
    const sql = fs.readFileSync('./supabase/migrations/20260809000001_ontology_graph.sql', 'utf8');
    
    // Execute
    console.log('Applying migration 20260809000001_ontology_graph.sql...');
    await client.query(sql);
    console.log('Migration applied successfully!');
  } catch (err) {
    console.error('Error applying migration:', err);
  } finally {
    await client.end();
  }
}

run();
