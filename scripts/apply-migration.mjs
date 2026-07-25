// Apply a single migration file to the Supabase database.
// Reads credentials from .env.local (never hardcoded). Usage:
//   node scripts/apply-migration.mjs <migration-file.sql>
//
// Uses the Supabase transaction pooler (eu-west-1), the known-working path
// for DDL from this project. Migrations are expected to be idempotent
// (IF NOT EXISTS / OR REPLACE), so re-running is safe.

import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const env = {};
  const raw = readFileSync(resolve(__dirname, '../.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return env;
}

const env = loadEnvLocal();
const password = env.SUPABASE_PASSWORD;
const projectRef = (env.NEXT_PUBLIC_SUPABASE_URL || '').split('//')[1]?.split('.')[0];

if (!password || !projectRef) {
  console.error('Missing SUPABASE_PASSWORD or NEXT_PUBLIC_SUPABASE_URL in .env.local');
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <migration-file.sql>');
  process.exit(1);
}

const connectionString = `postgresql://postgres.${projectRef}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log(`Connected to project ${projectRef}.`);
  const sql = readFileSync(resolve(__dirname, '../supabase/migrations/', file), 'utf8');
  console.log(`Applying ${file} ...`);
  await client.query(sql);
  console.log('Applied successfully.');
  await client.end();
}

main().catch((err) => {
  console.error('Migration FAILED:', err.message);
  process.exit(1);
});
