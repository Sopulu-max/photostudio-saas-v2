import { defineConfig } from 'vitest/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });

export default defineConfig({
  test: {
    environment: 'node',
    /*
     * These run against a real remote Supabase, not a local stub, so every hook
     * is network-bound. The 10s default failed on latency alone and 60s was
     * marginal — a red run that meant nothing except that the network was
     * slower that minute. Raised rather than worked around, because the cost of
     * a flaky suite is that a real regression gets waved through as "probably
     * the network again".
     */
    hookTimeout: 120000,
    testTimeout: 120000,
    /*
     * One file at a time. Every suite talks to the SAME remote database; run in
     * parallel they contend for it, and the symptom is not an error but a
     * timeout. Sequential costs half a minute and buys a red run that means
     * something.
     */
    fileParallelism: false,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
