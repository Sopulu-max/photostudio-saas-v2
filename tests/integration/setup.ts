/**
 * Integration test setup.
 * Reads the local Supabase credentials from environment and exposes them
 * for the test suite. Requires `npx supabase start` to be running.
 */
import { config } from 'dotenv';
import WebSocket from 'ws';

if (typeof global.WebSocket === 'undefined') {
  (global as any).WebSocket = WebSocket;
}

// Load .env.local (Next.js convention) so tests see NEXT_PUBLIC_SUPABASE_* vars
config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '\n[Integration Setup] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local\n' +
    'Run `npx supabase start` and ensure .env.local is populated.\n'
  );
  process.exit(1);
}

// Make available to all integration tests
process.env.TEST_SUPABASE_URL = SUPABASE_URL;
process.env.TEST_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
process.env.TEST_SUPABASE_SERVICE_KEY = SUPABASE_SERVICE_KEY ?? SUPABASE_ANON_KEY;
