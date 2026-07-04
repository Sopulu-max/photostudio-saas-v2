import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    setupFiles: ['./tests/integration/setup.ts'],
    hookTimeout: 60000,
    testTimeout: 60000,
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
});
