import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('workflows')
    .select(`
      *,
      template:workflow_templates(name),
      agreement:agreements(
        id,
        person:persons(display_name, email, phone)
      ),
      tasks(
        id,
        stage_name,
        stage_order,
        status,
        assigned_person_id,
        person:persons(display_name)
      )
    `)
    .limit(1);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Workflows:', data);
  }
}

check();
