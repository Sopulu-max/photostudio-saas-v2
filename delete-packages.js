const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Find "glamour studio" org
  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id, name');
  if (orgErr) {
    console.error('Error fetching orgs', orgErr);
    return;
  }
  const org = orgs.find(o => o.name.toLowerCase().includes('glamour studio'));
  if (!org) {
    console.error('Glamour studio not found. Found orgs:', orgs);
    return;
  }
  console.log('Found org:', org.name, org.id);

  // Find packages
  const { data: packages, error: pkgErr } = await supabase
    .from('packages')
    .select('id, name')
    .eq('organization_id', org.id);

  if (pkgErr) {
    console.error('Error fetching packages', pkgErr);
    return;
  }

  console.log('Available packages:', packages.map(p => p.name));

  const targetNames = ['2 edited photographs', '4 edited photographs'];
  
  // They might be named exactly that, or contain that in the name
  const toDelete = packages.filter(p => targetNames.some(t => p.name.toLowerCase().includes(t.toLowerCase())));

  if (toDelete.length === 0) {
    console.log('No matching packages found to delete.');
    return;
  }

  console.log('Found packages to delete:', toDelete);

  // Delete them
  const ids = toDelete.map(p => p.id);
  const { error: delErr } = await supabase.from('packages').delete().in('id', ids);

  if (delErr) {
    console.error('Error deleting packages', delErr);
  } else {
    console.log('Successfully deleted packages.');
  }
}

run();
