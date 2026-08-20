import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * Creating a studio — the one path every customer walks exactly once.
 *
 * WHY IT HAD NO COVERAGE, AND WHY THAT MATTERED. createOrganization asks the
 * request who is signed in, through cookies(), which exists only inside a Next
 * request. So the unit suite could not reach it and the smoke test could not
 * either — the smoke test signs a user in, but signing up is the step BEFORE
 * there is anything to sign in to. It sat in the one blind spot both had.
 *
 * It broke there, too. After employees.title was dropped, this function still
 * wrote it, so every new studio failed at signup with PGRST204 — invisible to
 * typecheck, because the Supabase client is untyped, and invisible to the
 * build, which never runs the query.
 *
 * WHAT IS MOCKED, AND WHAT DELIBERATELY IS NOT. Only the answer to "who is
 * asking" — the single piece that needs a request. Every write runs for real
 * against the real database, because the bugs this is here to catch are the
 * ones where the code and the schema disagree, and a mocked database agrees
 * with whatever you tell it.
 */

const { session } = vi.hoisted(() => ({ session: { user: null as any } }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user }, error: null }) },
  }),
}));

import { createOrganization } from '@/kernel/organizations';

const email = `signup+${randomUUID()}@example.com`;
let userId = '';

/*
 * A tag carried in every studio this run creates.
 *
 * Cleanup used to track the ids the function RETURNED, which is only the ids of
 * the calls that succeeded — and a failing run is exactly when a half-made
 * studio is left behind. Proving that took two orphans: the organization is
 * written in step two and the throw came in step three, so there was nothing to
 * record. Finding them by name afterwards needs no cooperation from the code
 * under test, which is the point.
 */
const RUN = randomUUID().slice(0, 8);

describe('Creating a studio', () => {
  beforeAll(async () => {
    // A real auth user, because the function ends by writing to their metadata
    // through the admin API, and that step is half the point of it.
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email, password: `S1gnup-${randomUUID()}`, email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Could not create the signup user: ${error?.message}`);
    userId = data.user.id;
    session.user = { id: userId, email, user_metadata: {} };
  });

  afterAll(async () => {
    const { data: mine } = await supabaseAdmin
      .from('organizations').select('id').like('name', `%${RUN}%`);
    for (const { id } of (mine ?? []) as { id: string }[]) {
      // Child-first: contacts refuse to cascade from organizations.
      await supabaseAdmin.from('events').delete().eq('organization_id', id);
      await supabaseAdmin.from('employees').delete().eq('organization_id', id);
      await supabaseAdmin.from('contacts').delete().eq('organization_id', id);
      await supabaseAdmin.from('organizations').delete().eq('id', id);
    }
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
  });

  it('makes the studio, the owner and the link between them', async () => {
    const name = `Signup Studio ${RUN}`;
    const org = await createOrganization(name);

    expect(org.id).toBeTruthy();
    expect(org.name).toBe(name);

    // The owner exists as a kernel contact carrying their login. This is how
    // the app knows who owns a studio — not a word in a column.
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id, email, auth_user_id')
      .eq('organization_id', org.id)
      .maybeSingle();
    expect(contact, 'the owner has no contact record').toBeTruthy();
    expect(contact!.auth_user_id).toBe(userId);
    expect(contact!.email).toBe(email);

    /*
     * And NOT as an employee. Signing up used to put the owner on the team,
     * so they turned up on the attendance register waiting to check in and in
     * every count of who works here. Owning a studio is not working at one —
     * a solo photographer who does both adds themselves on the Team page, and
     * that is a second fact rather than the same one.
     *
     * This assertion used to be the opposite, and it is the reason the empty
     * register now reads as empty.
     */
    const { data: employees } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('organization_id', org.id);
    expect(employees ?? [], 'signing up put the owner on the team').toHaveLength(0);

    // The user is pointed back at the studio, or their next request lands on
    // "create a studio" again and they make a second one.
    const { data: refreshed } = await supabaseAdmin.auth.admin.getUserById(userId);
    expect(refreshed.user?.user_metadata?.organization_id).toBe(org.id);

    // And it is written down, since a studio appearing is the first thing that
    // ever happens to it.
    const { data: events } = await supabaseAdmin
      .from('events')
      .select('action, entity_type')
      .eq('organization_id', org.id);
    expect((events ?? []).some((e: { entity_type: string; action: string }) =>
      e.entity_type === 'organization' && e.action === 'created')).toBe(true);
  }, 60000);

  it('takes a storefront slug when one is given', async () => {
    const slug = `signup-${randomUUID().slice(0, 8)}`;
    const org = await createOrganization(`Slugged Studio ${RUN}`, slug);
    expect(org.slug).toBe(slug);
  }, 60000);

  it('refuses when nobody is signed in', async () => {
    const remembered = session.user;
    session.user = null;
    try {
      await expect(createOrganization(`Nobody’s Studio ${RUN}`)).rejects.toThrow(/logged in/i);
    } finally {
      session.user = remembered;
    }

    // And nothing was left behind by the attempt.
    const { data } = await supabaseAdmin
      .from('organizations').select('id').eq('name', `Nobody’s Studio ${RUN}`);
    expect(data ?? []).toHaveLength(0);
  }, 60000);
});
