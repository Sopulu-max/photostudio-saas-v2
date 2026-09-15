const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PACKAGE_PROMISE = `package_deliverables(quantity, decided_by, deliverable:deliverables(id, name, default_unit))`;
const SERVICE_OFFERS = `service_deliverables(deliverable:deliverables(id, name))`;

const PACKAGE_SELECT = `
  id, name, description, short_description, status, duration_minutes, extra_stages, price, instance_of, list_price, created_at, form_schema, member_of, is_family, contract_terms,
  package_images(id, url, position, sort),
  package_services(id, position, decided_by, service:services(
    id, name, description, domain:service_domains(id, name),
    workflow:workflows(id, name),
    ${SERVICE_OFFERS},
    service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position))),
    variables(id, service_id, key, label, unit, kind, options)
  ),
  package_service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position))),
  ${PACKAGE_PROMISE},
  package_variable_values(value, answered_by, variable:variables(id, service_id, deliverable_id, key, label, unit, kind)),
  package_tasks(id, workflow_task_id, name, role:roles(id, name), position, is_active))
`;

// Simulate FamilyShape.ts overlayMember
function overlayMember(packageServices, answers) {
  const find = (psId, kind, ref) => answers.find(a => a.package_service_id === psId && a.kind === kind && (a.ref_id ?? null) === ref);
  return (packageServices || []).filter(ps => {
    if (ps.decided_by !== 'member') return true;
    const a = find(ps.id, 'service', null);
    return !(a && a.value === false);
  }).map(ps => ({
    ...ps,
    package_deliverables: (ps.package_deliverables || []).map(pd => pd), // simplified
    package_variable_values: (ps.package_variable_values || []).flatMap(pv => pv) // simplified
  }));
}

async function run() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id, name');
  const org = orgs.find(o => o.name.toLowerCase().includes('glamour studio'));
  const orgId = org.id;

  // Simulate resolveMembers
  const { data: rows } = await supabaseAdmin.from('packages').select(PACKAGE_SELECT).eq('organization_id', orgId).not('member_of', 'is', null).limit(1);
  if (!rows || rows.length === 0) return console.log('No members');
  
  const member = rows[0];
  const familyId = member.member_of;
  const { data: fams } = await supabaseAdmin.from('packages').select(PACKAGE_SELECT).eq('organization_id', orgId).eq('id', familyId);
  const family = fams[0];

  const { data: rawAnswers } = await supabaseAdmin.from('member_answers').select('*').eq('organization_id', orgId).eq('package_id', member.id);
  
  const resolvedPs = overlayMember(family.package_services, rawAnswers || []);
  
  // See if package_service_dimension_values is there
  console.log("Resolved PS[0] package_service_dimension_values:", JSON.stringify(resolvedPs[0].package_service_dimension_values, null, 2));

  // Simulating shapeDimensionLinks for pkg.dimensions
  function shapeDimensionLinks(links) {
    const byDimension = new Map();
    for (const link of (links || [])) {
      const v = link?.dimension_value;
      const d = v?.dimension;
      if (!v || !d) continue;
      if (!byDimension.has(d.id)) {
        byDimension.set(d.id, { id: d.id, name: d.name, position: d.position ?? 0, values: [] });
      }
      byDimension.get(d.id).values.push({ id: v.id, name: v.name });
    }
    return Array.from(byDimension.values());
  }
  
  function packageDimensions(packageServices) {
    return shapeDimensionLinks(
      (packageServices || []).flatMap(ps => ps?.package_service_dimension_values || [])
    );
  }

  const pkgDims = packageDimensions(resolvedPs);
  console.log("pkg.dimensions:", JSON.stringify(pkgDims, null, 2));
}
run();
