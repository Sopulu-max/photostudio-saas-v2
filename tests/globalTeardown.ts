import dotenv from 'dotenv';
import path from 'path';
import WebSocket from 'ws';
import { readdir, readFile } from 'node:fs/promises';
import { PURGE_ORDER } from './purge';

/**
 * THE STUDIOS A KILLED RUN LEAVES BEHIND.
 *
 * Every suite purges its own studio in afterAll, which works only if the file
 * finishes. A run that is interrupted — Ctrl-C, a hook timeout, the connection
 * dropping mid-seed, all of which happened repeatedly this week — leaves the
 * studio and everything under it in the shared remote database.
 *
 * Ten of the eleven organizations in this database were that residue before it
 * was swept by hand. Sweeping by hand is backward-only; it accumulates again
 * on the next failed run. This is the forward half.
 *
 * WHAT IT IS ALLOWED TO TOUCH. Only organizations whose name a suite in this
 * directory currently claims to create. Not a name pattern and not a hardcoded
 * list — both drift, and the cost of drift here is deleting a real studio. If a
 * suite is renamed, this stops recognising its leftovers rather than guessing.
 *
 * TEARDOWN, NOT SETUP, and the difference is not cosmetic: exported as the
 * default it was called as setup, so it swept the PREVIOUS run's debris before
 * this one started and left this run's own behind — the opposite of the job.
 *
 * IT LOADS THE ENVIRONMENT ITSELF. A global hook runs outside `setupFiles`, so
 * the dotenv call in tests/setup.ts has not happened yet and the admin client
 * throws "Missing Supabase environment variables". The import of that client
 * is therefore deferred too, since it reads the variables when it is first
 * touched.
 */

/** Studio names the suites in this directory actually seed. */
async function seededStudioNames(dir: string): Promise<Set<string>> {
  const names = new Set<string>();
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.test.ts')) continue;
    const src = await readFile(path.join(dir, file), 'utf8');
    /*
     * Split on the CALL rather than call-plus-.insert: `from('organizations')`
     * and its `.insert(` are often on separate lines, and matching them as one
     * string misses the isolation fixtures entirely.
     */
    for (const block of src.split(/seedStudio\(|from\('organizations'\)/).slice(1)) {
      const m = block.slice(0, 400).match(/name: '([^']+)'/);
      if (m) names.add(m[1]);
    }
  }
  return names;
}

export async function teardown() {
  try {
    dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;

    /*
     * The same polyfill tests/setup.ts installs, for the same reason: this is
     * Node 20, which has no native WebSocket, and supabase-js builds a realtime
     * client the moment it is constructed. A global hook does not get
     * setupFiles, so it has to say so itself.
     */
    if (!(globalThis as any).WebSocket) (globalThis as any).WebSocket = WebSocket;

    /* Imported after the environment exists, not before. */
    const { supabaseAdmin } = await import('@/lib/supabase/admin');

    const names = await seededStudioNames(__dirname);
    if (names.size === 0) return;

    const { data } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .in('name', [...names]);

    const stranded = (data || []) as { id: string; name: string }[];
    if (stranded.length === 0) return;

    for (const org of stranded) {
      /* Children first, in the order the suites themselves use. */
      for (const table of PURGE_ORDER) {
        await supabaseAdmin.from(table).delete().eq('organization_id', org.id);
      }
      await supabaseAdmin.from('organizations').delete().eq('id', org.id);
    }

    console.log(
      `[teardown] swept ${stranded.length} test studio(s) an interrupted run left behind: `
      + stranded.map((o) => o.name).join(', '),
    );
  } catch (e) {
    /* Never fails the run. Debris is a nuisance; a teardown that turns a green
       run red is a suite nobody trusts. */
    console.error('[teardown] could not sweep leftover test studios:', e);
  }
}
