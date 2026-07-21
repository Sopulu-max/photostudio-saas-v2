const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf-8');
const envMap = {};
env.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) envMap[key.trim()] = val.join('=').trim().replace(/"/g, '');
});

const supabaseUrl = envMap['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseServiceKey = envMap['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testInsert() {
  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id').limit(1);
  if (orgErr) {
    console.error('Org error', orgErr);
    return;
  }
  const realOrgId = orgs[0].id;
  console.log("Using org:", realOrgId);

  const { data, error } = await supabase
    .from('workflow_templates')
    .insert([
      {
        organization_id: realOrgId,
        name: "Test workflow",
        stages: [{ name: "Test Stage", duration_hours: 24, requires_approval: false }],
        status: 'active'
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Insert error:', error);
  } else {
    console.log('Inserted:', data);
    // cleanup
    await supabase.from('workflow_templates').delete().eq('id', data.id);
  }
}

testInsert();
