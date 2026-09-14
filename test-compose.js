require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { composeMemberName } = require('./src/modules/packages/familyShape');

async function test() {
  const familyName = "Test Family";
  const left = { services: [], promises: [], variables: [] };
  const answers = [];
  try {
    const name = composeMemberName(familyName, left, answers);
    console.log("Composed name:", name);
  } catch (e) {
    console.error("Error in composeMemberName:", e);
  }
}

test();
