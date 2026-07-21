import { createClient } from '@supabase/supabase-js';

async function run() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get a random org ID to test with
  const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
  if (!orgs || orgs.length === 0) {
    console.log('No orgs found');
    return;
  }
  const orgId = orgs[0].id;

  const { data, error } = await supabase
    .from('workflow_templates')
    .insert([{
      organization_id: orgId,
      name: 'Test Workflow',
      stages: [{ name: 'Stage 1', order: 1 }],
      status: 'active',
    }])
    .select()
    .single();

  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('SUCCESS:', data);
  }
}

run();
