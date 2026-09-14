require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const orgId = '1571ea3b-c971-43ed-95ff-a474a65806da';
  const { data: member } = await supabase.from('packages').select('*').not('member_of', 'is', null).limit(1).single();
  console.log('Member:', member);
  
  if (member) {
    const { error } = await supabase.from('packages').update({ name: member.name }).eq('id', member.id);
    console.log('Update package:', error || 'success');
  }
}

test();
