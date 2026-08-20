import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * Every signed-in page still loads.
 *
 * WHY THIS EXISTS. Three bugs in one week reached a live site past a clean
 * typecheck, a clean build and a green suite: a page querying a column that had
 * been dropped, a public page sitting behind the login wall, and a price
 * rendered through the wrong formatter. None were reachable by the unit tests,
 * because none of them are about a function's return value — they are about
 * whether a PAGE, assembled from real data over a real request, comes back.
 *
 * WHAT IT DOES AND DOES NOT CATCH. It catches a page that 500s, redirects
 * somewhere it should not, or renders an error boundary instead of itself.
 * It does not catch a page that renders happily with the wrong number in it,
 * and it cannot click anything, so a broken dropdown still looks fine here.
 * Knowing that boundary matters more than the coverage: this is a check that
 * the app is standing up, not that it is correct.
 *
 * NEEDS A RUNNING SERVER, and skips loudly rather than failing when there is
 * none, so `npm test` stays honest on a machine that has not started one:
 *
 *     npm run build && npm start          # in one terminal
 *     npm run test:smoke                  # in another
 *
 * Point it elsewhere with SMOKE_BASE_URL to smoke a deployment.
 */

const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Is anything answering? Decided once, before the suite is described. */
const serverUp = await fetch(BASE, { redirect: 'manual' })
  .then(() => true)
  .catch(() => false);

if (!serverUp) {
  // eslint-disable-next-line no-console
  console.warn(
    `\n[smoke] Nothing is serving ${BASE}, so the page checks are skipped.\n` +
    `[smoke] Start the app (npm run build && npm start) or set SMOKE_BASE_URL.\n`,
  );
}

/**
 * The pages a studio actually opens, each with something that proves the page
 * itself rendered rather than an error boundary wearing its URL.
 *
 * The marker is deliberately a piece of the page's own furniture — a heading it
 * always shows — rather than data, so an empty studio passes and a broken one
 * does not.
 */
const PAGES: { path: string; expect: RegExp }[] = [
  { path: '/home', expect: /Everything your studio runs on/i },
  { path: '/overview', expect: /Command Center|needs your attention|Overview/i },
  { path: '/attendance', expect: /Recorded against|No employees yet/i },
  { path: '/team', expect: /Who does the work/i },
  { path: '/bookings', expect: /<\/html>/i },
  { path: '/clients', expect: /<\/html>/i },
  { path: '/contracts', expect: /<\/html>/i },
  { path: '/finances', expect: /<\/html>/i },
  { path: '/services', expect: /<\/html>/i },
  { path: '/services/settings', expect: /Classifications/i },
  { path: '/packages', expect: /<\/html>/i },
  { path: '/lens', expect: /<\/html>/i },
  { path: '/calendar', expect: /<\/html>/i },
  { path: '/tasks', expect: /<\/html>/i },
  { path: '/analytics', expect: /<\/html>/i },
  { path: '/settings', expect: /The hours you keep/i },
];

/** Next puts a digest on a server-side crash, and this is the error page's own markup. */
const CRASHED = /__next_error__|Application error: a server-side exception/i;

const email = `smoke+${randomUUID()}@example.com`;
const password = `Sm0ke-${randomUUID()}`;
let userId = '';
let orgId = '';
let cookieHeader = '';

describe.skipIf(!serverUp)('Smoke: every signed-in page loads', () => {
  beforeAll(async () => {
    // A real auth user, because the proxy asks Supabase who this is and will
    // not be talked out of it by a hand-made cookie.
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (error || !created.user) throw new Error(`Could not create the smoke user: ${error?.message}`);
    userId = created.user.id;

    // A studio for them to be inside. Built directly rather than through
    // createOrganization, which needs a request context this test does not
    // have — the same reason that function's own bug reached production.
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ name: 'Smoke Test Studio', slug: `smoke-${randomUUID().slice(0, 8)}`, status: 'active' })
      .select('id').single();
    if (orgError || !org) throw new Error(`Could not create the smoke studio: ${orgError?.message}`);
    orgId = org.id;

    await supabaseAdmin.from('contacts').insert({
      organization_id: orgId, display_name: 'Smoke Tester', email, auth_user_id: userId,
    });
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { organization_id: orgId },
    });

    // Sign in for real tokens.
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password });
    if (signInError || !session.session) throw new Error(`Could not sign in: ${signInError?.message}`);

    /*
     * The cookies the app itself would have written.
     *
     * Built by handing the session to @supabase/ssr and collecting what it
     * sets, rather than by guessing at the cookie's name, encoding and chunk
     * size. Those are the library's business and it changes them; a test that
     * hard-codes them tests last year's library.
     */
    const jar = new Map<string, string>();
    const ssr = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
        },
      },
    );
    await ssr.auth.setSession({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
    });

    cookieHeader = [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ');
    expect(cookieHeader.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    // Order matters: contacts refuse to cascade from organizations.
    if (orgId) {
      await supabaseAdmin.from('events').delete().eq('organization_id', orgId);
      await supabaseAdmin.from('contacts').delete().eq('organization_id', orgId);
      await supabaseAdmin.from('booking_stages').delete().eq('organization_id', orgId);
      await supabaseAdmin.from('organizations').delete().eq('id', orgId);
    }
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
  });

  it('signs in and is not bounced to the login page', async () => {
    const res = await fetch(`${BASE}/home`, { headers: { cookie: cookieHeader }, redirect: 'manual' });
    // A redirect here means the session was not accepted, and every page below
    // would then "pass" by quietly rendering the login screen.
    expect(res.status, `/home redirected to ${res.headers.get('location')}`).toBe(200);
  });

  it.each(PAGES)('$path renders', async ({ path, expect: marker }) => {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie: cookieHeader }, redirect: 'manual' });
    expect(res.status, `${path} returned ${res.status} → ${res.headers.get('location') ?? ''}`).toBe(200);

    const html = await res.text();
    expect(html, `${path} rendered Next's error page`).not.toMatch(CRASHED);
    expect(html, `${path} did not contain its own markup`).toMatch(marker);
    // A signed-in page that renders the login form has been silently bounced.
    expect(html, `${path} rendered the login screen`).not.toMatch(/Log in to your Weave account/i);
  });

  it('serves the public storefront without a session at all', async () => {
    const { data: org } = await supabaseAdmin
      .from('organizations').select('slug').eq('id', orgId).single();
    const res = await fetch(`${BASE}/storefront/${org!.slug}`, { redirect: 'manual' });
    // This is the one page whose whole purpose is to be seen by people with no
    // account, and it spent a while behind the login wall.
    expect(res.status, `the storefront redirected to ${res.headers.get('location')}`).toBe(200);
  });
});
