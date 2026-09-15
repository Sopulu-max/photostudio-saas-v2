const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// We need to run getPackage from the backend to see EXACTLY what it returns.
// The easiest way is to import it using tsx.
