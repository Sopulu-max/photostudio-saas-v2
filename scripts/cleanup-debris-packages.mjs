// One-off: remove test-debris packages left over from early experimentation.
//
// NOT a migration. This is environment data, not schema — a migration would
// replay this delete against every future database, including ones where those
// rows mean something.
//
// Only removes packages that are ALL of: retired, bundling no services, and
// referenced by no booking line. A package a client actually booked stays
// whichever state it is in — that is history, not debris. Prints counts either
// side and the name of every row it touches, because a delete that reports
// "done" and nothing else is how data goes missing quietly.
//
//   node scripts/cleanup-debris-packages.mjs          # show what would go
//   node scripts/cleanup-debris-packages.mjs --commit # actually delete

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

const commit = process.argv.includes('--commit');

const SELECT_DEBRIS = `
  select p.id, o.name as studio, p.name
  from packages p
  join organizations o on o.id = p.organization_id
  where p.status = 'retired'
    and not exists (select 1 from package_services ps where ps.package_id = p.id)
    and not exists (select 1 from booking_lines bl where bl.package_id = p.id)
  order by o.name, p.created_at
`;

const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 6543,
  user: `postgres.${projectRef}`,
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log(`Connected to project ${projectRef}.`);

const before = await client.query('select count(*)::int as n from packages');
const { rows: debris } = await client.query(SELECT_DEBRIS);

if (debris.length === 0) {
  console.log(`No debris packages. ${before.rows[0].n} packages, all of them referenced or live.`);
  await client.end();
  process.exit(0);
}

console.log(`\n${debris.length} debris package(s) — retired, bundling nothing, booked by nobody:`);
for (const r of debris) console.log(`  · ${r.studio} — ${r.name}`);

if (!commit) {
  console.log('\nDry run. Re-run with --commit to delete these.');
  await client.end();
  process.exit(0);
}

const ids = debris.map((r) => r.id);
const { rowCount } = await client.query('delete from packages where id = any($1::uuid[])', [ids]);
const after = await client.query('select count(*)::int as n from packages');

console.log(`\nDeleted ${rowCount}. Packages: ${before.rows[0].n} → ${after.rows[0].n}.`);
if (before.rows[0].n - after.rows[0].n !== debris.length) {
  console.error('COUNT MISMATCH — expected to remove exactly ' + debris.length + '. Investigate.');
  process.exit(1);
}
await client.end();
