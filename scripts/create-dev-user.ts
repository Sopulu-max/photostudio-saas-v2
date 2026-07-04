import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import WebSocket from 'ws';

if (typeof global.WebSocket === 'undefined') {
  (global as any).WebSocket = WebSocket;
}

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const email = 'dev@studio.com';
  const password = 'password123';
  const orgId = '11111111-2222-3333-4444-555555555555';

  console.log(`Creating user ${email}...`);
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError) {
    if (authError.code === 'email_exists' || (authError.message && authError.message.includes('already registered'))) {
        console.log("User already exists. Fetching user ID to link to org...");
        const { data: users, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) {
            console.error("Error listing users:", listError);
            return;
        }
        const existingUser = users.users.find(u => u.email === email);
        if (existingUser) {
            linkUser(existingUser.id, email, password, orgId);
        }
        return;
    }
    console.error("Error creating user:", authError);
    return;
  }

  linkUser(authData.user.id, email, password, orgId);
}

async function linkUser(userId: string, email: string, password: string, orgId: string) {
  console.log(`User ID: ${userId}`);
  console.log(`Linking user to organization ${orgId}...`);
  const { error: linkError } = await supabase
    .from('user_organizations')
    .insert({
      user_id: userId,
      org_id: orgId,
      role: 'owner'
    });

  if (linkError) {
    if (linkError.code === '23505') { // unique violation
       console.log("User is already linked to the organization.");
    } else {
       console.error("Error linking user:", linkError);
       return;
    }
  }

  console.log("\n✅ Success! You can now log in at http://localhost:3000 with:");
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
}

main();
