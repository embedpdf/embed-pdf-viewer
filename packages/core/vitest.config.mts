import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // Without the browser condition, `svelte` resolves to its server entry and
    // mount() throws lifecycle_function_unavailable.
    conditions: ['browser'],
    alias: [
      // Adapter sources self-import the base package; point that at the source
      // entry so tests do not depend on a prior `vite build`.
      {
        find: /^@embedpdf\/core$/,
        replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
