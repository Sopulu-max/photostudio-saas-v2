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
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
