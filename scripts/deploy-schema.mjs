/**
 * Deploy the kernel schema to Supabase via the Management API.
 * Run with: node scripts/deploy-schema.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://qvscrdunkqkiswxvxbbm.supabase.co';
const SERVICE_ROLE_KEY = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
  .split('\n')
  .find(line => line.startsWith('SUPABASE_SERVICE_ROLE_KEY'))
  ?.split('=')[1]
  ?.replace(/"/g, '')
  ?.trim();

if (!SERVICE_ROLE_KEY) {
  console.error('Could not read SUPABASE_SERVICE_ROLE_KEY from .env.local');
  process.exit(1);
}

const sql = readFileSync(resolve(__dirname, '../supabase/migrations/001_kernel_schema.sql'), 'utf-8');

async function deploy() {
  console.log('Deploying kernel schema to Supabase...');
  console.log(`Target: ${SUPABASE_URL}`);

  // Use the Supabase SQL endpoint (pg-meta)
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'HEAD',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  // The supabase-js client doesn't expose raw SQL execution.
  // The SQL must be run via the Supabase Dashboard SQL Editor
  // or via the Supabase CLI: supabase db push
  
  console.log('\n========================================');
  console.log('MANUAL STEP REQUIRED');
  console.log('========================================');
  console.log('The SQL migration file is ready at:');
  console.log('  supabase/migrations/001_kernel_schema.sql');
  console.log('');
  console.log('To deploy, do ONE of the following:');
  console.log('');
  console.log('Option A: Supabase Dashboard');
  console.log('  1. Go to https://supabase.com/dashboard');
  console.log('  2. Open your project');
  console.log('  3. Go to SQL Editor');
  console.log('  4. Paste the contents of 001_kernel_schema.sql');
  console.log('  5. Click Run');
  console.log('');
  console.log('Option B: Supabase CLI');
  console.log('  npx supabase db push');
  console.log('========================================');
}

deploy().catch(console.error);
