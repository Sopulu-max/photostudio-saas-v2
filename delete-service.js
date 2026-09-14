const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

async function deleteService() {
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%Glamour%');

  const orgId = orgs[0].id;
  console.log('Org:', orgs[0].name);

  const { data: services, error: fetchErr } = await supabase
    .from('services')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('name', 'Portrait Photography');

  if (fetchErr) { console.error('Fetch error:', fetchErr); return; }
  if (!services || services.length === 0) { console.log('No service named "Portrait Photography" found.'); return; }

  console.log(`Found ${services.length} match(es):`);
  services.forEach(s => console.log(` - ${s.name} (${s.id})`));

  const { error: delErr } = await supabase
    .from('services')
    .delete()
    .eq('id', services[0].id)
    .eq('organization_id', orgId);

  if (delErr) {
    console.error('Delete error:', delErr);
  } else {
    console.log('Deleted successfully.');
  }
}

deleteService();
