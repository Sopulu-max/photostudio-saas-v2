const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

async function deleteDebris() {
  // 1. Get Glamour Studio Org ID
  const { data: orgs, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%Glamour%');
  
  if (orgErr || !orgs || orgs.length === 0) {
    console.error('Could not find Glamour Studio organization', orgErr);
    return;
  }
  
  const orgId = orgs[0].id;
  console.log('Found Organization:', orgs[0].name, '(', orgId, ')');

  // 2. Fetch all packages and their images for this org
  const { data: packages, error: pkgErr } = await supabase
    .from('packages')
    .select('id, name, instance_of, package_images(id)')
    .eq('organization_id', orgId)
    .is('instance_of', null); // ONLY delete catalog packages, not booking instances

  if (pkgErr) {
    console.error('Error fetching packages:', pkgErr);
    return;
  }

  // Filter packages that have no cover (package_images array is empty)
  const debrisPackages = packages.filter(p => !p.package_images || p.package_images.length === 0);
  
  console.log(`Found ${debrisPackages.length} packages with no cover.`);
  
  if (debrisPackages.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  // Print what we are deleting for the log
  debrisPackages.forEach(p => console.log(` - Deleting: ${p.name || 'Untitled'} (${p.id})`));

  // 3. Delete the debris
  const debrisIds = debrisPackages.map(p => p.id);
  
  const { error: delErr } = await supabase
    .from('packages')
    .delete()
    .in('id', debrisIds)
    .eq('organization_id', orgId); // Extra safety check

  if (delErr) {
    console.error('Error deleting packages:', delErr);
  } else {
    console.log('Successfully deleted all debris packages.');
  }
}

deleteDebris();
