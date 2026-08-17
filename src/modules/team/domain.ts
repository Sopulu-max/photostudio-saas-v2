'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
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
    .select('id, status, title, created_at, contact:contacts(id, display_name, email, phone, avatar_url), employee_roles(role:roles(id, name))')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list employees:', error);
    throw new Error('Failed to load the team');
  }
  return data || [];
}

/** One employee, with everything the detail page shows. */
export async function getEmployee(employeeId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('employees')
    .select('id, status, title, created_at, contact:contacts(id, display_name, email, phone, avatar_url), employee_roles(role:roles(id, name))')
    .eq('id', employeeId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return data;
}

/**
 * An employee was write-once until now. Identity (name/email/phone) lives on
 * the kernel contact; role/skills live on the employee row — this updates
 * whichever side the caller actually passed.
 */
export async function updateEmployee(input: {
  employeeId: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;

}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: existing } = await supabaseAdmin
    .from('employees')
    .select('id, contact_id')
    .eq('id', input.employeeId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!existing) throw new Error('Employee not found');

  const contactPatch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('An employee needs a name.');
    contactPatch.display_name = name;
  }
  if (input.email !== undefined) contactPatch.email = input.email || null;
  if (input.phone !== undefined) contactPatch.phone = input.phone || null;
  if (Object.keys(contactPatch).length > 0) {
    const { error } = await supabaseAdmin
      .from('contacts')
      .update(contactPatch)
      .eq('id', existing.contact_id)
      .eq('organization_id', orgId);
    if (error) {
      console.error('Failed to update employee contact:', error);
      throw new Error('Failed to save the employee');
    }
  }

  const employeePatch: Record<string, unknown> = {};
  if (input.title !== undefined) employeePatch.title = input.title || null;

  if (Object.keys(employeePatch).length > 0) {
    const { error } = await supabaseAdmin
      .from('employees')
      .update(employeePatch)
      .eq('id', input.employeeId)
      .eq('organization_id', orgId);
    if (error) {
      console.error('Failed to update employee:', error);
      throw new Error('Failed to save the employee');
    }
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'employee',
    entityId: input.employeeId,
    action: 'updated',
    actorId: actorId ?? undefined,
    payload: { ...contactPatch, ...employeePatch },
  });

  revalidatePath('/team');
  revalidatePath(`/team/${input.employeeId}`);
  return { ok: true };
}

/** Archive an employee, or bring them back. Never deletes — past assignments keep their contact. */
export async function setEmployeeStatus(input: { employeeId: string; status: 'active' | 'archived' }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('employees')
    .update({ status: input.status })
    .eq('id', input.employeeId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to change the employee');

  await logEvent({
    organizationId: orgId,
    entityType: 'employee',
    entityId: input.employeeId,
    action: input.status === 'archived' ? 'archived' : 'restored',
    actorId: actorId ?? undefined,
  });

  revalidatePath('/team');
  revalidatePath(`/team/${input.employeeId}`);
  return { ok: true };
}

/** Take a role back off an employee. The role itself survives. */
export async function removeRoleAssignment(input: { employeeId: string; roleId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('employee_roles')
    .delete()
    .eq('employee_id', input.employeeId)
    .eq('role_id', input.roleId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to remove the role');

  await logEvent({
    organizationId: orgId,
    entityType: 'employee',
    entityId: input.employeeId,
    action: 'role_removed',
    actorId: actorId ?? undefined,
    payload: { roleId: input.roleId },
  });

  revalidatePath('/team');
  revalidatePath(`/team/${input.employeeId}`);
  return { ok: true };
}

/** Rename a role or change its description. */
export async function updateRole(input: { roleId: string; name?: string; description?: string | null }) {
  const { orgId } = await getAuthOrgId();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('A role needs a name.');
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description || null;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabaseAdmin
    .from('roles')
    .update(patch)
    .eq('id', input.roleId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to save the role (does that name already exist?)');

  revalidatePath('/team');
  return { ok: true };
}

/** Remove a role entirely. Employees who had it just lose the badge — nothing else references a role. */
export async function deleteRole(roleId: string) {
  const { orgId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('roles')
    .delete()
    .eq('id', roleId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to remove the role');

  revalidatePath('/team');
  return { ok: true };
}

/**
 * Find a role by name, or create it — same find-or-create mechanism Services
 * uses for its own facets. This is how a Blueprint stage can name a role
 * ("Video Editor") without a separate trip to Team first, whether typed by a
 * studio or suggested by a Template.
 */
export async function findOrCreateRole(name: string): Promise<string | null> {
  const { orgId } = await getAuthOrgId();
  const clean = (name || '').trim();
  if (!clean) return null;

  const { data: existing } = await supabaseAdmin
    .from('roles')
    .select('id')
    .eq('organization_id', orgId)
    .eq('name', clean)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from('roles')
    .insert({ organization_id: orgId, name: clean })
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await supabaseAdmin.from('roles').select('id').eq('organization_id', orgId).eq('name', clean).maybeSingle();
      if (retry) return retry.id;
    }
    console.error('Failed to create role:', error);
    return null;
  }
  return created?.id ?? null;
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
    // Who holds it, not just what it is called. Roles are found-or-created by
    // blueprints, so a studio accumulates the names its PROCESS needs — and
    // nothing ever asked which of them a person actually fills. A role nobody
    // holds cannot staff the work that routes to it, and that was invisible.
    .select('id, name, description, employee_roles(employee_id)')
    .eq('organization_id', orgId)
    .order('name');
  if (error) {
    console.error('Failed to list roles:', error);
    throw new Error('Failed to load roles');
  }
  return ((data || []) as any[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description ?? null) as string | null,
    heldBy: (r.employee_roles || []).length as number,
  }));
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
