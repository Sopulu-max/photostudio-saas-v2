import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key");
  process.exit(1);
}

// Ensure ws is available (Node.js 20)
const WebSocket = require('ws');

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: {
    transport: WebSocket,
  }
});

async function fixIdentity() {
  console.log('Inserting primal Identity record...');
  
  const { data, error } = await supabase
    .from('identities')
    .insert({
      organization_id: '11111111-2222-3333-4444-555555555555',
      name: 'Lumiere Studios Lagos',
      brand_colors: { primary: '#d4af37', secondary: '#ffffff' }
    })
    .select();

  if (error) {
    if (error.code === '23505') {
      console.log('Identity already exists!');
    } else {
      console.error('Error inserting identity:', error);
    }
  } else {
    console.log('Success:', data);
  }
}

fixIdentity();
