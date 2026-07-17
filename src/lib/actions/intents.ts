'use server';

import { z } from 'zod';
import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Intent, IntentStatus } from '../types/engine';

const CreateIntentSchema = z.object({
  organizationId: z.string().uuid(),
  personId: z.string().uuid(),
  source: z.string().optional(),
  description: z.string().optional(),
  serviceTemplateId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  actorId: z.string().uuid().optional(), // In public intake, this is the personId
});

export async function createIntent(input: z.infer<typeof CreateIntentSchema>) {
  const params = CreateIntentSchema.parse(input);
  const actor = params.actorId || params.personId;

  const { data: intent, error } = await supabaseAdmin
    .from('intents')
    .insert({
      organization_id: params.organizationId,
      person_id: params.personId,
      source: params.source || null,
      description: params.description || null,
      service_template_id: params.serviceTemplateId || null,
      metadata: params.metadata || {},
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create intent:', error);
    throw new Error('Failed to create intent');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'intent',
    entityId: intent.id,
    action: 'created',
    actorId: actor,
    payload: { source: params.source, serviceTemplateId: params.serviceTemplateId }
  });

  return intent as Intent;
}

export async function updateIntentStatus(
  intentId: string, 
  organizationId: string, 
  status: IntentStatus, 
  actorId: string
) {
  const { data: intent, error } = await supabaseAdmin
    .from('intents')
    .update({ status })
    .eq('id', intentId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update intent status:', error);
    throw new Error('Failed to update intent status');
  }

  await logEvent({
    organizationId,
    entityType: 'intent',
    entityId: intent.id,
    action: 'status_updated',
    actorId,
    payload: { status }
  });

  return intent as Intent;
}
