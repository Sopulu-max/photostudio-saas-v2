/**
 * Remove every studio except one, backing up first.
 *
 * WHY A BACKUP. This deletes real rows from the live database — bookings,
 * clients, invoices — and there is no undo. The dump written alongside it is
 * the only way back, so it is written and verified BEFORE anything is removed.
 *
 * Usage:
 *   node scripts/purge-other-studios.mjs --keep <org-id> --dry-run
 *   node scripts/purge-other-studios.mjs --keep <org-id> --confirm
 *
 * Without --confirm it reports what it would do and changes nothing.
 */

import pg from 'pg';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
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

/** Child-first. Mirrors tests/purge.ts, which is the same problem. */
const PURGE_ORDER = [
  'events',
  'assignments', 'booking_tasks', 'booking_line_variable_values', 'booking_lines',
  'financial_transactions', 'invoice_lines', 'invoices',
  'delivery_deliverables', 'delivery_assets', 'assets', 'deliveries', 'contracts',
  'bookings',
  'package_tasks', 'package_deliverables', 'package_delivery_containers', 'package_services',
  'package_variable_values', 'packages',
  'service_deliverables', 'service_variables', 'service_dimension_values', 'services',
  'workflow_tasks', 'workflows', 'workflow_templates',
  'employee_roles', 'employees', 'clients',
  'contacts',
  'attendance', 'studio_hours',
  'roles', 'booking_stages', 'delivery_containers', 'deliverables',
  'dimension_values', 'dimensions', 'service_domains',
  'visual_layouts', 'service_templates', 'service_domain_labels',
];

const args = process.argv.slice(2);
const keep = args[args.indexOf('--keep') + 1];
const confirmed = args.includes('--confirm');

if (!keep || keep.startsWith('--')) {
  console.error('Usage: node scripts/purge-other-studios.mjs --keep <org-id> [--confirm]');
  process.exit(1);
}

const env = loadEnvLocal();
const projectRef = (env.NEXT_PUBLIC_SUPABASE_URL || '').split('//')[1]?.split('.')[0];
const connectionString =
  `postgresql://postgres.${projectRef}:${env.SUPABASE_PASSWORD}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;

async function main() {
  const db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { rows: orgs } = await db.query('select id, name, slug from organizations order by created_at');
  const kept = orgs.find((o) => o.id === keep);
  if (!kept) {
    console.error(`No studio with id ${keep}. Nothing done.`);
    process.exit(1);
  }
  const doomed = orgs.filter((o) => o.id !== keep);

  console.log(`Keeping:  ${kept.name} (${kept.slug ?? 'no slug'})`);
  console.log(`Removing: ${doomed.length} studio(s)\n`);

  // ── Back up everything belonging to the studios being removed ─────────────
  const backup = { takenAt: new Date().toISOString(), kept: kept.id, studios: doomed, tables: {} };
  let backedUp = 0;

  for (const table of [...PURGE_ORDER, 'organizations']) {
    try {
      const ids = table === 'organizations' ? doomed.map((o) => o.id) : doomed.map((o) => o.id);
      const column = table === 'organizations' ? 'id' : 'organization_id';
      const { rows } = await db.query(
        `select * from ${table} where ${column} = any($1::uuid[])`, [ids],
      );
      if (rows.length > 0) {
        backup.tables[table] = rows;
        backedUp += rows.length;
      }
    } catch (e) {
      // A table without organization_id, or one that no longer exists. Recorded
      // rather than swallowed: a backup with a silent hole is not a backup.
      backup.tables[`__skipped_${table}`] = String(e.message);
    }
  }

  mkdirSync(resolve(__dirname, '../backups'), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = resolve(__dirname, `../backups/studios-${stamp}.json`);
  writeFileSync(path, JSON.stringify(backup, null, 2), 'utf8');

  // Read it back before trusting it.
  const verified = JSON.parse(readFileSync(path, 'utf8'));
  const verifiedRows = Object.entries(verified.tables)
    .filter(([k]) => !k.startsWith('__skipped_'))
    .reduce((n, [, v]) => n + v.length, 0);
  if (verifiedRows !== backedUp) {
    console.error(`Backup did not read back cleanly (${verifiedRows} of ${backedUp}). Nothing deleted.`);
    process.exit(1);
  }
  console.log(`Backed up ${backedUp} rows to ${path}\n`);

  if (!confirmed) {
    console.log('Dry run. Rows that WOULD be deleted:');
    for (const [table, rows] of Object.entries(backup.tables)) {
      if (!table.startsWith('__skipped_')) console.log(`  ${String(rows.length).padStart(5)}  ${table}`);
    }
    console.log('\nRe-run with --confirm to delete.');
    await db.end();
    return;
  }

  // ── Delete, child-first ───────────────────────────────────────────────────
  const ids = doomed.map((o) => o.id);
  let removed = 0;
  for (const table of PURGE_ORDER) {
    try {
      const { rowCount } = await db.query(
        `delete from ${table} where organization_id = any($1::uuid[])`, [ids],
      );
      if (rowCount > 0) {
        console.log(`  removed ${String(rowCount).padStart(5)}  ${table}`);
        removed += rowCount;
      }
    } catch (e) {
      console.error(`  FAILED on ${table}: ${e.message}`);
    }
  }

  const { rowCount: orgsGone } = await db.query('delete from organizations where id = any($1::uuid[])', [ids]);
  console.log(`\nRemoved ${removed} rows and ${orgsGone} studio(s).`);

  const { rows: left } = await db.query('select name from organizations');
  console.log(`Remaining: ${left.map((o) => o.name).join(', ') || '(none)'}`);

  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
