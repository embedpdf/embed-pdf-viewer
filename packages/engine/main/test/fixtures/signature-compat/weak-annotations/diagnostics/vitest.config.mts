import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['*.probe.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
