// The tests: components and `.svelte.ts` modules compiled for the browser, in happy-dom, with
// Testing Library's cleanup after each test.
//
// Vitest here runs on Vite 5, and `@sveltejs/vite-plugin-svelte` needs Vite 6, so the tests
// compile with `svelte/compiler` directly (`./test/helpers/svelte-compile.ts`). Svelte strips the
// type annotations in `<script lang="ts">` itself; `svelte-package` and `svelte-check` read
// `svelte.config.js`.
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';
import { svelteCompile } from './test/helpers/svelte-compile';

export default defineConfig({
  plugins: [svelteCompile(), svelteTesting()],
  resolve: {
    // Svelte's browser runtime, not its server build.
    conditions: ['browser'],
  },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    // Through Vite, so they resolve with the conditions above.
    server: { deps: { inline: [/[\\/]svelte[\\/]/, /@testing-library[\\/]svelte/] } },
  },
});
