import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // These run against a real remote Supabase, not a local stub, so the
    // purge/seed hooks are network-bound. The 10s default fails on latency
    // rather than on anything being wrong, which reads as a false regression.
    hookTimeout: 60000,
    testTimeout: 60000,
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
