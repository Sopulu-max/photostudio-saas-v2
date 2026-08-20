'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/kernel/events';
import type { Organization } from '@/lib/types/engine';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { revalidatePath } from 'next/cache';

export async function createOrganization(name: string, slug?: string) {
  // 1. Get the current authenticated user
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be logged in to create a studio.');
  }

  // 2. Create Organization
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({ name, slug: slug || null })
    .select()
    .single();

  if (orgError) {
    console.error('Failed to create organization:', orgError);
    throw new Error(orgError.message || 'Failed to create organization');
  }

  // 3. The owner's identity: a kernel contact (linked to their login) and an
  //    employee record in the Team module.
  const { data: contact, error: contactError } = await supabaseAdmin
    .from('contacts')
    .insert({
      organization_id: org.id,
      display_name: user.email?.split('@')[0] || 'Studio Owner',
      email: user.email,
      auth_user_id: user.id,
    })
    .select('id')
    .single();

  if (contactError || !contact) {
    console.error('Failed to create owner contact:', contactError);
    throw new Error(contactError?.message || 'Failed to create your studio identity');
  }

  /*
   * No employee record. Owning a studio is not working at one.
   *
   * Signing up used to put the owner on the team, so they appeared on the
   * attendance register waiting to check in, in the staffing pickers, and in
   * every count of who works here — none of which they had asked for, and none
   * of which the app needed: identity runs through contacts.auth_user_id, and
   * nothing anywhere looks up an employee by the signed-in user.
   *
   * A solo photographer who owns the studio and shoots it IS staff, and adds
   * themselves on the Team page. That is a different fact from owning it, and
   * the difference is exactly what this stops assuming.
   */

  // 4. Update the user's Auth metadata to link to the new Organization
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      organization_id: org.id
    }
  });

  if (updateError) {
    console.error('Failed to update user metadata:', updateError);
    throw new Error(updateError.message || 'Failed to link user to organization');
  }

  // 5. Log Event
  await logEvent({
    organizationId: org.id,
    entityType: 'organization',
    entityId: org.id,
    action: 'created',
    payload: { name, slug }
  });

  return org as Organization;
}

/** Who this studio is — name, storefront slug, and the timezone its days run on. */
export async function getStudio(): Promise<{ id: string; name: string; slug: string | null; timezone: string; opensAt: string | null; closesAt: string | null; metadata?: Record<string, any> } | null> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, timezone, opens_at, closes_at, metadata')
    .eq('id', orgId)
    .maybeSingle();
  if (!data) return null;
  const o = data as any;
  return {
    id: o.id, name: o.name, slug: o.slug,
    timezone: o.timezone || 'UTC',
    // Postgres returns "08:30:00"; every reader wants "08:30".
    opensAt: o.opens_at ? String(o.opens_at).slice(0, 5) : null,
    closesAt: o.closes_at ? String(o.closes_at).slice(0, 5) : null,
    metadata: o.metadata || {},
  };
}

/**
 * The studio behind a storefront slug. The public path has no session to read
 * an org from, so the slug is the only identifier a visitor carries — this is
 * the one place that resolves it, rather than every public page doing its own.
 */
export async function getStudioBySlug(slug: string): Promise<{ id: string; name: string; slug: string; currency: string; metadata: Record<string, any> } | null> {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, currency, metadata')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  const o = data as any;
  return { id: o.id, name: o.name, slug: o.slug, currency: o.currency || 'USD', metadata: o.metadata || {} };
}

/**
 * Who can actually sign in to this studio — distinct from the Team roster,
 * which is about who does the work. Identity is a kernel concern, so it is
 * answered here rather than by any one module.
 */
export async function listStudioLogins(): Promise<{ id: string; name: string; email: string | null }[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id, display_name, email')
    .eq('organization_id', orgId)
    .not('auth_user_id', 'is', null)
    .order('display_name');
  if (error) {
    console.error('Failed to list studio logins:', error);
    return [];
  }
  return ((data || []) as any[]).map((c) => ({ id: c.id, name: c.display_name, email: c.email ?? null }));
}

/** The currency this studio bills in. Every money surface reads this. */
export async function getStudioCurrency(): Promise<string> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('currency')
    .eq('id', orgId)
    .maybeSingle();
  return data?.currency || 'USD';
}

/** Change the currency the studio bills in (global setting). */
export async function setStudioCurrency(code: string) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ currency: code })
    .eq('id', orgId);
  if (error) throw new Error('Failed to set the currency');
  revalidatePath('/settings');
  revalidatePath('/services');
  return { ok: true };
}

/**
 * Who the studio is — its name, its handle, and who it is on paper.
 *
 * The slug is in every public URL (/book/<slug>/…), so changing it breaks links
 * already shared with clients — the UI says so before you do it.
 *
 * The billing fields exist because an invoice that says what a client owes and
 * nothing about where to send it is not an invoice. They live in metadata
 * alongside the logo rather than in their own columns: a studio fills them in
 * over time, and progressive enrichment is the rule here — a studio with no
 * bank details yet still gets a working invoice, just a quieter one.
 */
export async function updateStudio(input: {
  name?: string;
  slug?: string;
  logoUrl?: string;
  coverUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  /** How a client actually pays — bank details, transfer reference, whatever. */
  paymentInstructions?: string;
  /** Anything that belongs at the bottom of every document. */
  invoiceFooter?: string;
}) {
  const { orgId } = await getAuthOrgId();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Your studio needs a name.');
    patch.name = name;
  }
  if (input.slug !== undefined) {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!slug) throw new Error('The handle needs at least one letter or number.');
    patch.slug = slug;
  }
  
  const metaKeys: [keyof typeof input, string][] = [
    ['logoUrl', 'logo_url'],
    ['coverUrl', 'cover_url'],
    ['contactEmail', 'contact_email'],
    ['contactPhone', 'contact_phone'],
    ['address', 'address'],
    ['paymentInstructions', 'payment_instructions'],
    ['invoiceFooter', 'invoice_footer'],
  ];
  const touched = metaKeys.filter(([k]) => input[k] !== undefined);
  if (touched.length > 0) {
    // Merged, not replaced: settings are edited a section at a time, and a
    // form that only knows about payment details must not wipe the logo.
    const { data: org } = await supabaseAdmin.from('organizations').select('metadata').eq('id', orgId).single();
    const existingMeta = (org?.metadata as Record<string, any>) || {};
    const next = { ...existingMeta };
    for (const [k, column] of touched) {
      const value = String(input[k] ?? '').trim();
      if (value) next[column] = value;
      else delete next[column];
    }
    patch.metadata = next;
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabaseAdmin
    .from('organizations')
    .update(patch)
    .eq('id', orgId);
  if (error) {
    console.error('Failed to update studio:', error);
    throw new Error('Failed to save (is that handle already taken?)');
  }

  revalidatePath('/settings');
  revalidatePath('/home');
  // Every invoice reprints the studio's own block, so it changes with this.
  revalidatePath('/finances', 'layout');
  return { ok: true };
}
