// Run a read-only SQL query against the Supabase database and print the rows.
// Reads credentials from .env.local (never hardcoded). Usage:
//   node scripts/db-query.mjs "select 1"
// Intended for verification/inspection, not mutations.

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
const sql = process.argv[2];

if (!password || !projectRef || !sql) {
  console.error('Usage: node scripts/db-query.mjs "<sql>"  (needs .env.local creds)');
  process.exit(1);
}

const connectionString = `postgresql://postgres.${projectRef}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query(sql);
  console.table(res.rows);
  await client.end();
}

main().catch((err) => {
  console.error('Query FAILED:', err.message);
  process.exit(1);
});
