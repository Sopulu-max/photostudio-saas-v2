import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

globalThis.WebSocket = WebSocket;

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://qvscrdunkqkiswxvxbbm.supabase.co';
const SERVICE_ROLE_KEY = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
  .split('\n')
  .find(line => line.startsWith('SUPABASE_SERVICE_ROLE_KEY'))
  ?.split('=')[1]
  ?.replace(/"/g, '')
  ?.trim();

if (!SERVICE_ROLE_KEY) {
  console.error('Could not read SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function seed() {
  console.log('Seeding database...');

  // 1. Create Organization
  const { data: org, error: orgError } = await supabase.from('organizations').insert({
    name: 'Demo Studio',
    slug: 'demo',
    status: 'active'
  }).select().single();

  if (orgError) throw orgError;
  console.log('Created Organization:', org.id);

  // 2. Create Configurator
  const { data: configurator, error: confError } = await supabase.from('persons').insert({
    organization_id: org.id,
    role: 'configurator',
    display_name: 'Alice Manager',
    email: 'alice@demo.studio',
    status: 'active'
  }).select().single();

  if (confError) throw confError;
  console.log('Created Configurator:', configurator.id);

  // 3. Create Client
  const { data: client, error: clientError } = await supabase.from('persons').insert({
    organization_id: org.id,
    role: 'client',
    display_name: 'Bob Client',
    email: 'bob@example.com',
    status: 'active'
  }).select().single();

  if (clientError) throw clientError;

  // 4. Create Service Template
  const { data: template, error: tmplError } = await supabase.from('service_templates').insert({
    organization_id: org.id,
    name: 'Premium Portrait Session',
    workflow_stages: [
      { name: 'Capture', order: 1 },
      { name: 'Retouching', order: 2 },
      { name: 'Delivery', order: 3 }
    ],
    pricing: { base_price: 500, currency: 'USD' }
  }).select().single();

  if (tmplError) throw tmplError;
  console.log('Created Service Template:', template.id);

  // 5. Create Intent
  const { data: intent, error: intentError } = await supabase.from('intents').insert({
    organization_id: org.id,
    person_id: client.id,
    service_template_id: template.id,
    source: 'storefront_form',
    status: 'created'
  }).select().single();

  if (intentError) throw intentError;
  console.log('Created Intent:', intent.id);

  // 6. Create active Agreement & Workflow to populate dashboard
  const { data: activeClient, error: acError } = await supabase.from('persons').insert({
    organization_id: org.id,
    role: 'client',
    display_name: 'Charlie Active',
  }).select().single();

  const { data: activeIntent } = await supabase.from('intents').insert({
    organization_id: org.id,
    person_id: activeClient.id,
    status: 'accepted'
  }).select().single();

  const { data: agreement } = await supabase.from('agreements').insert({
    organization_id: org.id,
    intent_id: activeIntent.id,
    person_id: activeClient.id,
    status: 'active'
  }).select().single();

  const { data: workflow } = await supabase.from('workflows').insert({
    organization_id: org.id,
    agreement_id: agreement.id,
    template_id: template.id,
    status: 'in_progress'
  }).select().single();

  // Create tasks for the workflow
  await supabase.from('tasks').insert([
    { workflow_id: workflow.id, stage_name: 'Capture', stage_order: 1, status: 'completed' },
    { workflow_id: workflow.id, stage_name: 'Retouching', stage_order: 2, status: 'in_progress' },
    { workflow_id: workflow.id, stage_name: 'Delivery', stage_order: 3, status: 'created' }
  ]);

  console.log('Seeded active Workflow & Tasks');
  console.log('Seed completed successfully!');
}

seed().catch(console.error);
