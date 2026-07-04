import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Integration tests run with: npm run test:gate
    // Requires: npx supabase start
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**/*.test.ts'], // excluded by default; use test:gate
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
