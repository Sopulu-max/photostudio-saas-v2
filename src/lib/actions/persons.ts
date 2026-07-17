'use server';

import { z } from 'zod';
import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Person, PersonRole } from '../types/engine';

const CreatePersonSchema = z.object({
  organizationId: z.string().uuid(),
  role: z.enum(['configurator', 'operator', 'client', 'vendor', 'freelancer']),
  displayName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  actorId: z.string().uuid().optional(),
});

const FindOrCreateClientSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1, 'Name is required'),
});

export async function createPerson(input: z.infer<typeof CreatePersonSchema>) {
  const params = CreatePersonSchema.parse(input);

  const { data: person, error } = await supabaseAdmin
    .from('persons')
    .insert({
      organization_id: params.organizationId,
      role: params.role,
      display_name: params.displayName,
      email: params.email || null,
      phone: params.phone || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create person:', error);
    throw new Error('Failed to create person');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'person',
    entityId: person.id,
    action: 'created',
    actorId: params.actorId || person.id,
    payload: { role: params.role, displayName: params.displayName, email: params.email }
  });

  return person as Person;
}

export async function findOrCreateClient(input: z.infer<typeof FindOrCreateClientSchema>) {
  const params = FindOrCreateClientSchema.parse(input);

  const { data: existingPerson, error: fetchError } = await supabaseAdmin
    .from('persons')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('email', params.email)
    .maybeSingle();

  if (fetchError) {
    console.error('Error fetching person:', fetchError);
    throw new Error('Failed to lookup person');
  }

  if (existingPerson) {
    return existingPerson as Person;
  }

  // Create new client if missing
  return createPerson({
    organizationId: params.organizationId,
    role: 'client',
    displayName: params.displayName,
    email: params.email,
  });
}
