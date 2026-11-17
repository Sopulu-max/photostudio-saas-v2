// Make the client-facing half visible: real image files in storage, a gallery
// built from them, a price list behind it, and the link printed at the end.
//
// The images are generated here rather than fetched from anywhere - solid
// colour PNGs, encoded by hand - so this depends on nothing outside the repo.
//
//   node scripts/seed-sample-gallery.mjs

import pg from 'pg';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

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

/* ---------------------------------------------------------------- the PNGs */

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n += 1) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A width x height PNG that fades between two colours, so tiles look unalike. */
function png(width, height, from, to) {
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // no filter
    const t = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);
      const mix = (t + u) / 2;
      row[1 + x * 3] = Math.round(from[0] + (to[0] - from[0]) * mix);
      row[2 + x * 3] = Math.round(from[1] + (to[1] - from[1]) * mix);
      row[3 + x * 3] = Math.round(from[2] + (to[2] - from[2]) * mix);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ the run */

const projectRef = (env.NEXT_PUBLIC_SUPABASE_URL || '').split('//')[1]?.split('.')[0];
const client = new Client({
  connectionString:
    `postgresql://postgres.${projectRef}:${env.SUPABASE_PASSWORD}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows: studios } = await client.query('select id, name from weave.studios order by created_at limit 1');
if (!studios[0]) { console.error('No studio. Run scripts/seed-studio.mjs first.'); process.exit(1); }
const studioId = studios[0].id;

const { rows: jobs } = await client.query(
  `select id from weave.jobs where studio_id = $1 order by created_at limit 1`, [studioId],
);
if (!jobs[0]) { console.error('No job. Run scripts/seed-sample-job.mjs first.'); process.exit(1); }
const jobId = jobs[0].id;

const palette = [
  [[196, 120, 92], [242, 206, 178]],
  [[64, 78, 112], [158, 180, 214]],
  [[112, 128, 96], [206, 216, 180]],
  [[148, 96, 116], [226, 190, 200]],
  [[86, 92, 100], [198, 204, 212]],
  [[176, 148, 96], [238, 224, 186]],
];

const uploaded = [];
for (let i = 0; i < palette.length; i += 1) {
  const bytes = png(900, 600, palette[i][0], palette[i][1]);
  const name = `frame-${String(i + 1).padStart(2, '0')}.png`;
  const path = `${studioId}/${jobId}/${randomUUID()}-${name}`;

  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/weave-files/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'image/png',
      },
      body: bytes,
    },
  );
  if (!res.ok) { console.error('Upload failed:', name, res.status, await res.text()); process.exit(1); }

  const { rows } = await client.query(
    `insert into weave.files (studio_id, job_id, storage_path, name, mime_type, size_bytes)
     values ($1,$2,$3,$4,'image/png',$5) returning id`,
    [studioId, jobId, path, name, bytes.length],
  );
  uploaded.push(rows[0].id);
}

// A price list with something on it, so the gallery has a shop.
const { rows: lists } = await client.query(
  `insert into weave.price_lists (studio_id, name, is_default)
   select $1, 'Prints and files', true
   where not exists (select 1 from weave.price_lists where studio_id = $1)
   returning id`, [studioId],
);
const listId = lists[0]?.id
  ?? (await client.query('select id from weave.price_lists where studio_id = $1 limit 1', [studioId])).rows[0].id;

const products = [
  ['8 x 10 print', 'physical', 500000],
  ['12 x 18 print', 'physical', 1200000],
  ['Full resolution file', 'digital', 750000],
];
for (let i = 0; i < products.length; i += 1) {
  await client.query(
    `insert into weave.products (studio_id, price_list_id, name, kind, price, currency, position)
     select $1,$2,$3,$4,$5,'NGN',$6
     where not exists (select 1 from weave.products where price_list_id = $2 and name = $3)`,
    [studioId, listId, products[i][0], products[i][1], products[i][2], i],
  );
}

const { rows: galleries } = await client.query(
  `insert into weave.galleries (studio_id, job_id, name, shared_at, price_list_id)
   values ($1, $2, 'The selects', now(), $3) returning id, token`,
  [studioId, jobId, listId],
);
const gallery = galleries[0];

for (let i = 0; i < uploaded.length; i += 1) {
  await client.query(
    `insert into weave.gallery_files (studio_id, gallery_id, file_id, position)
     values ($1,$2,$3,$4) on conflict do nothing`,
    [studioId, gallery.id, uploaded[i], i],
  );
}

console.log('');
console.log(`  ${uploaded.length} pictures, a price list, and a gallery that is open.`);
console.log('');
console.log(`  The client's gallery:  http://localhost:3000/g/${gallery.token}`);
console.log('');

await client.end();
