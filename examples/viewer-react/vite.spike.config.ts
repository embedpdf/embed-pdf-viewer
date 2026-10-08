/**
 * Builds `spike.html` and `spike-plain.html` against a build of `@embedpdf/viewer`
 * (`SPIKE_VIEWER_DIST`, default `dist`: the npm pass, which leaves the
 * framework-free packages to this app's bundler).
 *
 * Output: `dist-spike/<SPIKE_VIEWER_DIST>/`; `test/spike-hooks.mjs` serves and drives it.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const distName = process.env.SPIKE_VIEWER_DIST ?? 'dist';
const suffix = process.env.SPIKE_WRAPPER_COMPONENT ? '.head-wrapper' : '';
// SPIKE_ENTRY=spike|spike-plain builds one page alone, to measure it.
const entry = process.env.SPIKE_ENTRY;
const viewerDist = path.join(repo, 'packages/viewer/main', distName);

/**
 * Stands in for `@embedpdf/viewer` listing the shared packages as dependencies:
 * a bare `@embedpdf/*` import from its dist that its own node_modules can't
 * resolve resolves the way `@embedpdf/react`'s imports do. In the workspace
 * every link points at the same package directory, as one installed version
 * does for npm and pnpm.
 */
function viewerDependencies(): Plugin {
  const stands = [
    path.join(repo, 'packages/framework/react/src/index.ts'),
    path.join(repo, 'packages/viewer/chrome/src/index.ts'),
  ];
  return {
    name: 'spike-viewer-dependencies',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      if (!importer?.startsWith(viewerDist + path.sep) || !id.startsWith('@embedpdf/')) return null;
      for (const from of [importer, ...stands]) {
        const resolved = await this.resolve(id, from, { ...options, skipSelf: true });
        if (resolved) return resolved;
      }
      return null;
    },
  };
}

/**
 * SPIKE_WRAPPER_COMPONENT=<file> swaps the wrapper's `./component` for another copy (the
 * committed one, to measure the bundle before the kernel hand-off).
 */
function wrapperComponent(): Plugin | null {
  const file = process.env.SPIKE_WRAPPER_COMPONENT;
  const wrapper = path.join(repo, 'packages/viewer/react/src') + path.sep;
  if (!file) return null;
  return {
    name: 'spike-wrapper-component',
    enforce: 'pre',
    resolveId: (id, importer) =>
      id === './component' && importer?.startsWith(wrapper) ? path.resolve(file) : null,
  };
}

export default defineConfig({
  plugins: [react(), viewerDependencies(), wrapperComponent()],
  resolve: {
    alias: [
      { find: /^@embedpdf\/viewer$/, replacement: path.join(viewerDist, 'index.js') },
      { find: /^@embedpdf\/viewer\/core$/, replacement: path.join(viewerDist, 'core.js') },
      // The wrapper from source, with the kernel hand-off under test.
      {
        find: /^@embedpdf\/viewer-react$/,
        replacement: path.join(repo, 'packages/viewer/react/src/index.ts'),
      },
    ],
    // The wrapper's `@embedpdf/react/runtime` resolves from this app, like the app's own
    // imports: one React copy of the headless adapter.
    dedupe: ['@embedpdf/react', 'react', 'react-dom'],
  },
  build: {
    outDir: path.join(here, 'dist-spike', `${distName}${entry ? `.${entry}` : ''}${suffix}`),
    emptyOutDir: true,
    rollupOptions: {
      input: entry
        ? { [entry]: path.join(here, `${entry}.html`) }
        : {
            spike: path.join(here, 'spike.html'),
            'spike-plain': path.join(here, 'spike-plain.html'),
          },
    },
  },
});
