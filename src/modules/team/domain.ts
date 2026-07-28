'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/lib/actions/events';
import { revalidatePath } from 'next/cache';

/**
 * Team — who does the work. An employee specialises a kernel contact; roles are
 * studio-defined (not hardcoded) and attach to employees via employee_roles.
 */
export async function addEmployee(input: { name: string; email?: string; phone?: string; title?: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const name = (input.name || '').trim();
  if (!name) throw new Error('An employee needs a name.');

  const { data: contact, error: cErr } = await supabaseAdmin
    .from('contacts')
    .insert({
      organization_id: orgId,
      display_name: name,
      email: input.email || null,
      phone: input.phone || null,
    })
    .select('id')
    .single();
  if (cErr || !contact) {
    console.error('Failed to add employee (contact):', cErr);
    throw new Error('Failed to add employee');
  }

  const { data: employee, error } = await supabaseAdmin
    .from('employees')
    .insert({ organization_id: orgId, contact_id: contact.id, title: input.title || null })
    .select('id')
    .single();
  if (error || !employee) {
    console.error('Failed to add employee:', error);
    throw new Error('Failed to add employee');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'employee',
    entityId: employee.id,
    action: 'created',
    actorId: actorId ?? undefined,
    payload: { name, title: input.title },
  });

  revalidatePath('/team');
  return { employeeId: employee.id, contactId: contact.id };
}

export async function listEmployees() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('employees')
    .select('id, status, title, created_at, contact:contacts(id, display_name, email, phone), employee_roles(role:roles(id, name))')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list employees:', error);
    throw new Error('Failed to load the team');
  }
  return data || [];
}

export async function createRole(input: { name: string; description?: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const name = (input.name || '').trim();
  if (!name) throw new Error('A role needs a name.');

  const { data: role, error } = await supabaseAdmin
    .from('roles')
    .insert({ organization_id: orgId, name, description: input.description || null })
    .select('id')
    .single();
  if (error || !role) {
    console.error('Failed to create role:', error);
    throw new Error('Failed to create role (does it already exist?)');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'role',
    entityId: role.id,
    action: 'created',
    actorId: actorId ?? undefined,
    payload: { name },
  });

  revalidatePath('/team');
  return { roleId: role.id };
}

export async function listRoles() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('roles')
    .select('id, name, description')
    .eq('organization_id', orgId)
    .order('name');
  if (error) {
    console.error('Failed to list roles:', error);
    throw new Error('Failed to load roles');
  }
  return data || [];
}

export async function assignRole(input: { employeeId: string; roleId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('employee_roles')
    .insert({ organization_id: orgId, employee_id: input.employeeId, role_id: input.roleId });
  if (error) {
    console.error('Failed to assign role:', error);
    throw new Error('Failed to assign role (already assigned?)');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'employee',
    entityId: input.employeeId,
    action: 'role_assigned',
    actorId: actorId ?? undefined,
    payload: { roleId: input.roleId },
  });

  revalidatePath('/team');
  return { ok: true };
}
