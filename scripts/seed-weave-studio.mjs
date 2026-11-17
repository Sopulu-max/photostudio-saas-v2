// Create the first studio in `weave`, and link the operator who already has a
// login on this Supabase project.
//
// The previous system in `public` is the source for who that is: whichever
// contact carries an auth_user_id is an operator with a working password, so
// the new system adopts the same person rather than asking anyone to sign up
// twice. Idempotent — running it again changes nothing.
//
//   node scripts/seed-studio.mjs

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

const connectionString = `postgresql://postgres.${projectRef}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: operators } = await client.query(`
    select c.auth_user_id, c.display_name, c.email, o.name as studio
    from public.contacts c
    join public.organizations o on o.id = c.organization_id
    where c.auth_user_id is not null
    order by c.created_at
    limit 1
  `);

  if (operators.length === 0) {
    console.error('No linked operator found in public.contacts — nothing to adopt.');
    process.exit(1);
  }

  const op = operators[0];

  const { rows: studios } = await client.query(
    `insert into weave.studios (name)
     select $1
     where not exists (select 1 from weave.studios where name = $1)
     returning id`,
    [op.studio],
  );
  const studioId = studios[0]?.id
    ?? (await client.query('select id from weave.studios where name = $1', [op.studio])).rows[0].id;

  await client.query(
    `insert into weave.people (studio_id, name, email, auth_user_id)
     select $1, $2, $3, $4
     where not exists (select 1 from weave.people where auth_user_id = $4)`,
    [studioId, op.display_name, op.email, op.auth_user_id],
  );

  const { rows: check } = await client.query(
    `select s.name as studio, p.name as operator, p.email
     from weave.people p join weave.studios s on s.id = p.studio_id
     where p.auth_user_id = $1`,
    [op.auth_user_id],
  );
  console.table(check);

  await client.end();
}

main().catch((err) => {
  console.error('Seed FAILED:', err.message);
  process.exit(1);
});
