const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const envMap = {};
env.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) envMap[key.trim()] = val.join('=').trim().replace(/"/g, '');
});

const supabaseUrl = envMap['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseServiceKey = envMap['SUPABASE_SERVICE_ROLE_KEY'];

async function test() {
  // Get org
  const orgRes = await fetch(`${supabaseUrl}/rest/v1/organizations?select=id&limit=1`, {
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    }
  });
  const orgs = await orgRes.json();
  const orgId = orgs[0].id;
  console.log('Org:', orgId);

  // Insert
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/workflow_templates`, {
    method: 'POST',
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      organization_id: orgId,
      name: "Test workflow",
      stages: [{ name: "Test Stage", duration_hours: 24, requires_approval: false, order: 1 }],
      status: 'active'
    })
  });

  const body = await insertRes.text();
  console.log('Status:', insertRes.status);
  console.log('Response:', body);
}

test();
