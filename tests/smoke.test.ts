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

/**
 * One request, with one second chance.
 *
 * WHY THIS EXISTS. The suite talks to a dev server that compiles routes the
 * first time they are asked for. Immediately after a batch of edits, the first
 * request to a route can land inside that window and come back 404 or 500 —
 * not because the page is broken but because it is not built yet. It has
 * happened twice: once as a 500 on /analytics, once as 404s across every nested
 * route right after five files were written.
 *
 * That is worse than a slow suite. Both times it read exactly like a real
 * regression, and the second time it was diagnosed as one — stashed, seen to
 * pass, unstashed, seen to fail — because stashing recompiles too, so the
 * experiment reproduced the artefact rather than the cause.
 *
 * ONE RETRY, NOT A LOOP. A route that is compiling answers properly on the
 * second ask a moment later. A route that is genuinely broken answers the same
 * way twice, and the second answer is what the assertion sees — so a real 404
 * still fails, and fails with its own status rather than a timeout.
 */
async function load(path: string, init?: RequestInit): Promise<Response> {
  const ask = () => fetch(`${BASE}${path}`, { redirect: 'manual', ...init });
  const first = await ask();
  if (first.status !== 404 && first.status < 500) return first;
  await new Promise((r) => setTimeout(r, 1500));
  return ask();
}

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
  // Matched on a column heading, not the word "Galleries": that now sits in the
  // sidebar on every page, so it would pass even for a crashed one.
  { path: '/galleries', expect: /Client opened/i },
  { path: '/clients', expect: /<\/html>/i },
  { path: '/contracts', expect: /<\/html>/i },
  { path: '/finances', expect: /<\/html>/i },
  { path: '/services', expect: /<\/html>/i },
  { path: '/services/settings', expect: /Classifications/i },
  { path: '/packages', expect: /<\/html>/i },
  { path: '/services/classifications', expect: /By classification/i },
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
let packageId = '';
let bookingId = '';
let workflowId = '';

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

    /*
     * A package that actually bundles something.
     *
     * The empty studio above cannot reach a package's own two pages, and those
     * are the ones that read the bundle: what a package promises and how it is
     * produced hang off package_services, not off the package. A page still
     * asking the package directly renders an error boundary, which is precisely
     * what an empty fixture would never show.
     */
    // A swallowed insert here would strand the fixture and blame the page.
    const seed = async (table: string, row: Record<string, unknown>) => {
      const { data, error } = await supabaseAdmin.from(table).insert(row).select('id').single();
      if (error || !data) throw new Error(`Could not seed ${table}: ${error?.message}`);
      return data.id as string;
    };

    const domainId = await seed('service_domains', { organization_id: orgId, name: 'Smoke Domain' });
    /*
     * A workflow belongs to the service that is produced that way — there is no
     * join from the package to it any more, and no `blueprints` table for it to
     * live in. This suite went on seeding both, so every run died in beforeAll
     * and every page below reported itself skipped. Twenty-one green skips read
     * exactly like twenty-one passes in a summary line.
     */
    workflowId = await seed('workflows', {
      organization_id: orgId, name: 'Smoke Workflow', service_domain_id: domainId,
    });
    const [serviceId, deliverableId] = await Promise.all([
      seed('services', {
        organization_id: orgId, name: 'Smoke Service', service_domain_id: domainId,
        status: 'active', workflow_id: workflowId,
      }),
      seed('deliverables', { organization_id: orgId, name: 'Smoke Output', service_domain_id: domainId }),
    ]);
    // Priced, because an unpriced fixture cannot tell a page that lost the
    // price from a page that never had one to show.
    packageId = await seed('packages', {
      organization_id: orgId, name: 'Smoke Package', status: 'active',
      price: { base_price: 42000, currency: 'NGN' },
    });

    const bundledId = await seed('package_services', {
      organization_id: orgId, package_id: packageId, service_id: serviceId,
    });
    // Keyed on the bundle row, not on an id of its own: what a package promises
    // is said of the service within it that produces the thing.
    const promised = await supabaseAdmin.from('package_deliverables').insert({
      organization_id: orgId, package_service_id: bundledId, deliverable_id: deliverableId, quantity: 20,
    });
    if (promised.error) throw new Error(`Could not seed what the package promises: ${promised.error.message}`);

    /*
     * A booking, because its detail page is the largest in the app and was the
     * one with no render coverage at all — nine sections of client, date,
     * packages, team, tasks, deliverables, invoices and contract, none of which
     * anything here had ever loaded.
     *
     * Deliberately bare: no client, no date, no lines. That is a real state —
     * a booking is taken with whatever is known and filled in as it comes — and
     * it is the state most likely to divide by zero somewhere.
     */
    const stageId = await seed('booking_stages', {
      organization_id: orgId, name: 'Smoke Stage', kind: 'enquiry', position: 0, is_default: true,
    });
    bookingId = await seed('bookings', {
      organization_id: orgId, title: 'Smoke Booking', stage_id: stageId,
    });
  });

  afterAll(async () => {
    // Order matters: contacts refuse to cascade from organizations.
    if (orgId) {
      // These do not cascade from the studio, so they go first. Services before
      // workflows, because a service points at the workflow that produces it.
      await supabaseAdmin.from('bookings').delete().eq('organization_id', orgId);
      await supabaseAdmin.from('packages').delete().eq('organization_id', orgId);
      await supabaseAdmin.from('services').delete().eq('organization_id', orgId);
      await supabaseAdmin.from('workflows').delete().eq('organization_id', orgId);
      await supabaseAdmin.from('events').delete().eq('organization_id', orgId);
      await supabaseAdmin.from('contacts').delete().eq('organization_id', orgId);
      await supabaseAdmin.from('booking_stages').delete().eq('organization_id', orgId);
      await supabaseAdmin.from('organizations').delete().eq('id', orgId);
    }
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
  });

  it('signs in and is not bounced to the login page', async () => {
    const res = await load('/home', { headers: { cookie: cookieHeader } });
    // A redirect here means the session was not accepted, and every page below
    // would then "pass" by quietly rendering the login screen.
    expect(res.status, `/home redirected to ${res.headers.get('location')}`).toBe(200);
  });

  it.each(PAGES)('$path renders', async ({ path, expect: marker }) => {
    const res = await load(path, { headers: { cookie: cookieHeader } });
    /*
     * A 500 here used to report only "expected 500 to be 200", which says a page
     * is broken without saying how — and the session this suite builds is the
     * only way to reach these pages at all, so there was nowhere else to go and
     * look. Next puts the message and stack in the body; carry them into the
     * failure so the run that finds the break also explains it.
     */
    const detail = res.status >= 500
      ? '\n' + (await res.clone().text())
          .replace(/<script[\s\S]*?<\/script>/g, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ').trim().slice(0, 900)
      : ` → ${res.headers.get('location') ?? ''}`;
    expect(res.status, `${path} returned ${res.status}${detail}`).toBe(200);

    const html = await res.text();
    expect(html, `${path} rendered Next's error page`).not.toMatch(CRASHED);
    expect(html, `${path} did not contain its own markup`).toMatch(marker);
    // A signed-in page that renders the login form has been silently bounced.
    expect(html, `${path} rendered the login screen`).not.toMatch(/Log in to your Weave account/i);
  });

  it.each([
    { where: 'detail', path: () => `/packages/${packageId}`, marker: /Deliverables/i },
    { where: 'editor', path: () => `/packages/${packageId}/edit`, marker: /Smoke Package/i },
  ])('reads a bundled package on its $where page', async ({ path, marker }) => {
    const res = await load(path(), { headers: { cookie: cookieHeader } });
    expect(res.status, `${path()} returned ${res.status}`).toBe(200);

    const html = await res.text();
    expect(html, `${path()} rendered Next's error page`).not.toMatch(CRASHED);
    // Proves the page reached through package_services rather than rendering an
    // empty shell that would pass any check for its own furniture.
    expect(html, `${path()} did not show what the package bundles`).toMatch(/Smoke Service/i);
    expect(html, `${path()} did not show what it promises`).toMatch(marker);
  });

  /*
   * THE EDIT PAGE MUST OPEN SHOWING THE PRICE.
   *
   * It passed no price into the form for months. The box opened empty, and
   * because an empty box was read as "no price", pressing Save wrote that
   * emptiness back over the real figure — silently, with nothing on screen to
   * suggest anything had been lost. A studio lost what a package sold for by
   * opening it and saving an unrelated edit.
   *
   * Nothing caught it because the field was reached through a cast, so the
   * missing property was not a type error, and this suite — the one place a
   * page is actually rendered and read — had been dying in beforeAll.
   */
  it('opens the package editor with the price already in the box', async () => {
    const res = await load(`/packages/${packageId}/edit`, { headers: { cookie: cookieHeader } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html, 'the price box rendered without the price in it').toMatch(/value="42000"/);
  });

  /*
   * Every section of a booking renders, on a booking that holds almost nothing.
   *
   * The page folds its sections now and each states its own answer on its
   * header, so a shut one still says where the job has got to. Asserting the
   * headers proves both: that the nine sections are drawn, and that a booking
   * with no client, no date and no packages says so rather than throwing.
   */
  it('renders every section of a booking that holds almost nothing', async () => {
    const res = await load(`/bookings/${bookingId}`, { headers: { cookie: cookieHeader } });
    expect(res.status, `the booking page returned ${res.status}`).toBe(200);
    const html = await res.text();
    expect(html, 'the booking page rendered Next error page').not.toMatch(CRASHED);
    for (const section of ['Client', 'Date and time', 'Packages', 'Team', 'Tasks', 'Deliverables', 'Contract']) {
      expect(html, `the booking page is missing its ${section} section`).toMatch(section);
    }
    // The states an empty booking is in, said rather than left blank.
    expect(html, 'an unnamed client did not say so').toMatch(/Not named yet/i);
    expect(html, 'an unscheduled booking did not say so').toMatch(/Not scheduled/i);
  });

  it('serves the public storefront without a session at all', async () => {
    const { data: org } = await supabaseAdmin
      .from('organizations').select('slug').eq('id', orgId).single();
    const res = await load(`/storefront/${org!.slug}`);
    // This is the one page whose whole purpose is to be seen by people with no
    // account, and it spent a while behind the login wall.
    expect(res.status, `the storefront redirected to ${res.headers.get('location')}`).toBe(200);
  });
});
