import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { KernelRepository } from '../src/lib/domains/kernel/repository';
const WebSocket = require('ws');

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket }
});

async function testQuery() {
  const repo = new KernelRepository(supabase);
  const id = '11111111-2222-3333-4444-555555555555';
  
  const identity = await repo.getIdentity(id);
  console.log('Identity:', identity);
  
  const org = await repo.getOrganization(id);
  console.log('Org:', org);
}

testQuery().catch(console.error);
