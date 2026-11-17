// Put a couple of sample jobs on the board, so an empty studio has something
// to look at. Everything it makes is ordinary data and can be deleted from the
// app like anything else.
//
//   node scripts/seed-sample-job.mjs

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
const projectRef = (env.NEXT_PUBLIC_SUPABASE_URL || '').split('//')[1]?.split('.')[0];
const connectionString =
  `postgresql://postgres.${projectRef}:${env.SUPABASE_PASSWORD}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: studios } = await client.query(
  'select id from weave.studios order by created_at limit 1',
);
if (studios.length === 0) {
  console.error('No studio yet. Run scripts/seed-studio.mjs first.');
  process.exit(1);
}
const studioId = studios[0].id;

async function person(name, email) {
  const { rows } = await client.query(
    `insert into weave.people (studio_id, name, email)
     select $1, $2, $3
     where not exists (select 1 from weave.people where studio_id = $1 and name = $2)
     returning id`,
    [studioId, name, email],
  );
  if (rows[0]) return rows[0].id;
  const { rows: had } = await client.query(
    'select id from weave.people where studio_id = $1 and name = $2', [studioId, name],
  );
  return had[0].id;
}

const ada = await person('Ada Okafor', 'ada@example.com');
const chidi = await person('Chidi', 'chidi@example.com');

async function job(clientId, wants, expectedOn, turn) {
  const { rows } = await client.query(
    `insert into weave.jobs (studio_id, client_id, wants, expected_on, turn)
     values ($1, $2, $3, $4, $5) returning id`,
    [studioId, clientId, wants, expectedOn, turn],
  );
  return rows[0].id;
}

const soon = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);

const wedding = await job(ada, 'Wedding - the day, plus an album for her parents', soon, 'scheduled');
const portraits = await job(ada, 'Family portraits, three outfits, prints for the grandparents', null, 'us');
await job(chidi, 'Headshots for the new website', null, 'them');

async function occasion(jobId, what, onDate, startsAt, endsAt, crew) {
  const { rows } = await client.query(
    `insert into weave.occasions (studio_id, job_id, what, on_date, starts_at, ends_at)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [studioId, jobId, what, onDate, startsAt, endsAt],
  );
  for (const personId of crew) {
    await client.query(
      `insert into weave.crew (studio_id, occasion_id, person_id) values ($1,$2,$3)
       on conflict do nothing`,
      [studioId, rows[0].id, personId],
    );
  }
  return rows[0].id;
}

await occasion(wedding, 'The day', soon, '11:00', '21:00', [chidi]);
await occasion(wedding, 'Album review', null ?? soon, '15:00', '16:00', []);
await occasion(portraits, 'The shoot', today, '10:00', '12:00', [chidi]);

const { rows: counts } = await client.query(
  `select (select count(*) from weave.jobs where studio_id = $1) as jobs,
          (select count(*) from weave.occasions where studio_id = $1) as occasions,
          (select count(*) from weave.people where studio_id = $1) as people`,
  [studioId],
);
console.table(counts);

await client.end();
