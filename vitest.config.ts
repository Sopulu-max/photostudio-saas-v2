import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    /*
     * These run against a real remote Supabase over a high-latency connection,
     * not a local stub, so every hook is network-bound. The 10s default failed
     * on latency alone; 60s was then marginal and failed intermittently.
     *
     * A beforeAll that seeds an organization, a contact, two booking stages, a
     * service and a package is dozens of round trips — measured directly, seven
     * ordinary operations took fifty seconds. The setup lived just under the old
     * limit and crossed it at random, producing a red run that meant nothing
     * except that the network was slower that minute.
     *
     * Raised rather than worked around, because the cost of a flaky suite is
     * that a real regression gets waved through as "probably the network
     * again". Individual tests that need longer still say so themselves.
     */
    hookTimeout: 120000,
    testTimeout: 120000,
    /*
     * One test file at a time.
     *
     * Every suite here talks to the SAME remote database. Run in parallel they
     * contend for it, and the symptom is not an error but a timeout: the
     * instancing suite passed alone in 26s and failed in a full run where its
     * first test alone took 43s. Four suites went red, then all 22 passed on a
     * re-run with nothing changed.
     *
     * A suite that fails at random is worse than no suite, because the first
     * real regression it catches gets waved through as "probably flaky again".
     * Sequential costs about half a minute and buys a red run meaning something.
     */
    fileParallelism: false,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
