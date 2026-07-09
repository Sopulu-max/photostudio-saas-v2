import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });

async function runMigration() {
  // Try to use a direct postgres connection string if available
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres';
  
  console.log(`Connecting to ${connectionString.replace(/:[^:@]+@/, ':***@')}...`);
  
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260709000000_m7_modules_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running migration...');
    await client.query(sql);
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Error applying migration:', err);
  } finally {
    await client.end();
  }
}

runMigration();
