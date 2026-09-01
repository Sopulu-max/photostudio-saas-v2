// Remove test studios that outlived the runs that made them.
//
// A suite killed before its afterAll leaves its whole organization behind, and
// they had been accumulating in the real database — fifteen of them across a
// week, each with the services, packages and bookings its tests wrote.
//
// The match is an ALLOW-LIST of the exact names the suites use, never a
// pattern: anything matching "%Studio%" would one day match a real one. And it
// runs in a single transaction, so it either removes a studio completely or
// leaves it exactly as it was.
//
//   node scripts/purge-test-studios.mjs          # say what would go
//   node scripts/purge-test-studios.mjs --delete # actually remove it

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
  console.error('Needs SUPABASE_PASSWORD and NEXT_PUBLIC_SUPABASE_URL in .env.local');
  process.exit(1);
}

/** Exactly the names tests/*.ts give their studios. Nothing else is reachable. */
const TEST_NAMES = [
  'Instancing Studio', 'Money Path Studio', 'Task Flow Studio', 'Pricing Studio',
  'Occasion Date Studio', 'Open Lists Studio', 'Workflow Studio', 'Cover Studio',
  'New Client Studio', 'Smoke Test Studio',
];

/** Child-first, the same order tests/purge.ts uses when a run cleans up properly. */
const PURGE_ORDER = [
  'events',
  'assignments', 'booking_tasks', 'booking_line_variable_values', 'booking_lines',
  'financial_transactions', 'invoice_lines', 'invoices',
  'delivery_deliverables', 'delivery_assets', 'assets', 'deliveries', 'contracts',
  'bookings',
  'package_tasks', 'package_deliverables', 'package_delivery_containers', 'package_services',
  'package_variable_values',
  'packages',
  'service_deliverables', 'service_variables', 'service_dimension_values',
  'services',
  'workflow_tasks', 'workflows', 'workflow_templates',
  'employee_roles', 'employees', 'clients',
  'contacts',
  'attendance', 'studio_hours',
  'roles', 'booking_stages', 'delivery_containers', 'deliverables',
  'dimension_values', 'dimensions', 'service_domains',
];

const doIt = process.argv.includes('--delete');
const connectionString =
  `postgresql://postgres.${projectRef}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: targets } = await client.query(
  'select id, name from organizations where name = any($1) order by name', [TEST_NAMES]);

if (targets.length === 0) {
  console.log('No leftover test studios.');
  await client.end();
  process.exit(0);
}

console.log(`${targets.length} test ${targets.length === 1 ? 'studio' : 'studios'}:`);
for (const t of targets) console.log(`  ${t.name}  ${t.id}`);

if (!doIt) {
  console.log('\nNothing removed. Pass --delete to remove them.');
  await client.end();
  process.exit(0);
}

const ids = targets.map((t) => t.id);
try {
  await client.query('begin');
  for (const table of PURGE_ORDER) {
    // A table that no longer exists is not a failure — the schema moves, and
    // this list is a superset on purpose.
    try {
      await client.query(`delete from ${table} where organization_id = any($1)`, [ids]);
    } catch (e) {
      if (!/does not exist/i.test(e.message)) throw e;
    }
  }
  await client.query('delete from organizations where id = any($1)', [ids]);
  await client.query('commit');
  console.log(`\nRemoved ${targets.length}.`);
} catch (e) {
  await client.query('rollback');
  console.error(`\nRolled back, nothing removed: ${e.message}`);
  process.exitCode = 1;
}

const { rows: left } = await client.query(
  'select count(*)::int as n from organizations where name = any($1)', [TEST_NAMES]);
console.log(`${left[0].n} left.`);
await client.end();
