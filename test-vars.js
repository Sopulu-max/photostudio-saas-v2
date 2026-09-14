require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const orgId = '1571ea3b-c971-43ed-95ff-a474a65806da';
  const { data: member } = await supabase.from('packages').select('id, name, member_of').not('member_of', 'is', null).limit(1).single();
  
  if (!member) return console.log('no member');
  
  const { data: family } = await supabase.from('packages').select('*').eq('id', member.member_of).single();
  const { data: rows } = await supabase.from('package_services').select('*, service:services(*), package_variable_values(*, variable:service_variables(*)), package_deliverables(*, deliverable:deliverables(*))').eq('package_id', family.id);
  
  // recreate leftToMember logic manually:
  const left = { services: [], promises: [], variables: [] };
  for (const ps of rows) {
    if (ps.decided_by === 'member') left.services.push({ packageServiceId: ps.id, serviceId: ps.service_id, name: ps.service.name });
    for (const pd of ps.package_deliverables || []) {
      if (pd.decided_by === 'member') left.promises.push({ packageServiceId: ps.id, serviceName: ps.service.name, deliverableId: pd.deliverable_id, name: pd.deliverable.name });
    }
    for (const pv of ps.package_variable_values || []) {
      if (pv.answered_by === 'member') left.variables.push({ packageServiceId: ps.id, serviceName: ps.service.name, variableId: pv.variable_id, label: pv.variable.label, kind: pv.variable.kind, unit: pv.variable.unit });
    }
  }

  console.log("left", JSON.stringify(left, null, 2));

  // composeMemberName
  const parts = [];
  for (const s of left.services) {
    // ...
  }
  for (const v of left.variables) {
    // let's simulate an answer
    const a = { value: 2, answeredBy: 'studio' };
    const said = a.value + (v.unit ? ' ' + v.unit : '');
    try {
      parts.push(v.kind === 'number' && !v.unit ? `${said} ${v.label.toLowerCase()}` : said);
    } catch (e) {
      console.error("FAILED on variable:", v, "error:", e.message);
    }
  }
  console.log("parts", parts);
}

test();
