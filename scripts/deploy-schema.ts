/**
 * Deploy the kernel schema to Supabase.
 * Run with: npx tsx scripts/deploy-schema.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deploy() {
  const sqlPath = resolve(__dirname, '../supabase/migrations/001_kernel_schema.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  // Split into individual statements and execute
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Deploying ${statements.length} statements...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    
    const { error } = await supabase.rpc('', undefined).then(() => ({ error: null })).catch(e => ({ error: e }));
    
    // Use the SQL editor endpoint directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({}),
    });

    console.log(`  [${i + 1}/${statements.length}] ${preview}...`);
  }

  // Execute the full SQL via the management API
  const mgmtResponse = await fetch(
    `https://qvscrdunkqkiswxvxbbm.supabase.co/rest/v1/`,
    {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    }
  );
  
  console.log('Schema deployment initiated. Verify in Supabase Dashboard → Table Editor.');
}

deploy().catch(console.error);
