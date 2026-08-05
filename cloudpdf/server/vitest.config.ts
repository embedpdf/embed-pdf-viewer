import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Mirrors `tsup`'s `loader: { '.sql': 'text' }` for the Vitest/Vite
 * pipeline: `import sql from './001_initial.sql'` returns the file
 * contents as a string. Without this, Vite tries to parse `.sql`
 * files as JavaScript and explodes.
 *
 * Implemented as a `load` hook because Vite's `optimizeDeps.loader`
 * only applies to node_modules pre-bundling, not first-party source.
 */
function sqlAsTextPlugin(): Plugin {
  return {
    name: 'embedpdf-sql-as-text',
    enforce: 'pre',
    load(id) {
      // Vite sometimes appends query strings (?import, ?v=...). Strip
      // before extension-matching.
      const path = id.split('?')[0];
      if (!path || !path.endsWith('.sql')) return null;
      const text = readFileSync(path, 'utf8');
      return `export default ${JSON.stringify(text)};`;
    },
  };
}

export default defineConfig({
  plugins: [sqlAsTextPlugin()],
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.ts'],
  },
});
