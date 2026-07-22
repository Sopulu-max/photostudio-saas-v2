async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) throw new Error('Missing env vars');

  // 1. Get an org id
  const orgRes = await fetch(`${url}/rest/v1/organizations?select=id&limit=1`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  const orgs = await orgRes.json();
  const orgId = orgs[0].id;
  console.log('Using Org ID:', orgId);

  // 2. Try to insert
  const payload = {
    organization_id: orgId,
    name: 'Test Workflow',
    stages: [{ name: 'Stage 1', order: 1 }],
    status: 'active'
  };

  const insertRes = await fetch(`${url}/rest/v1/workflow_templates`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  if (!insertRes.ok) {
    const errorBody = await insertRes.text();
    console.error('Insert Failed:', errorBody);
  } else {
    const data = await insertRes.json();
    console.log('Insert Success:', data);
  }
}

run();
