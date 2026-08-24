import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite';

import { discoverSampleVariants } from './src/lib/sample-discovery';

/**
 * The live-demo half of the samples pipeline (DOCS-ARCHITECTURE.md pillar 3).
 *
 * Every sample variant (single `<base>.<fw>.<ext>` file or `<base>.<fw>/`
 * directory — see src/lib/sample-discovery.ts) is wrapped in a virtual entry
 * exporting `mount(el) => unmount`, compiled by the framework's own Vite
 * plugin (this is how .vue/.svelte run inside a Next site with zero webpack
 * surgery), and emitted self-contained into `public/demos/` — the docs load
 * them with a NATIVE dynamic import at runtime. The engine and its wasm ride
 * along as ordinary Vite assets, exactly like the example apps.
 */
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = path.join(ROOT, 'src', 'samples');

const MOUNTABLE: Record<string, (abs: string) => string> = {
  react: (abs) => `
    import { createElement } from 'react';
    import { createRoot } from 'react-dom/client';
    import App from ${JSON.stringify(abs)};
    export function mount(el) {
      const root = createRoot(el);
      root.render(createElement(App));
      return () => root.unmount();
    }`,
  vue: (abs) => `
    import { createApp } from 'vue';
    import App from ${JSON.stringify(abs)};
    export function mount(el) {
      const app = createApp(App);
      app.mount(el);
      return () => app.unmount();
    }`,
  svelte: (abs) => `
    import { mount as svelteMount, unmount as svelteUnmount } from 'svelte';
    import App from ${JSON.stringify(abs)};
    export function mount(el) {
      const app = svelteMount(App, { target: el });
      return () => svelteUnmount(app);
    }`,
};

const demos = discoverSampleVariants(SAMPLES, ['react', 'vue', 'svelte']);
const VIRTUAL_PREFIX = 'virtual:demo/';

function demoEntriesPlugin(): Plugin {
  return {
    name: 'epdf-demo-entries',
    resolveId(id) {
      // `.entry.js` keeps framework plugins from claiming the wrapper itself
      // (a virtual id ending in .svelte/.vue would be compiled as a component).
      if (id.startsWith(VIRTUAL_PREFIX)) return `\0${id}`;
      return null;
    },
    load(id) {
      if (!id.startsWith(`\0${VIRTUAL_PREFIX}`)) return null;
      const name = id.slice(VIRTUAL_PREFIX.length + 1).replace(/\.entry\.js$/, '');
      const demo = demos.find((d) => d.name === name);
      if (!demo) return null;
      return MOUNTABLE[demo.fw](demo.entry);
    },
    writeBundle() {
      // The manifest the docs build reads to know which demos exist.
      const manifest: Record<string, Record<string, string>> = {};
      for (const demo of demos) {
        const topicBase = demo.name.replace(`.${demo.fw}`, '');
        manifest[topicBase] ??= {};
        manifest[topicBase][demo.fw] = `/demos/${demo.name}.js`;
      }
      fs.mkdirSync(path.join(ROOT, 'public', 'demos'), { recursive: true });
      fs.writeFileSync(
        path.join(ROOT, 'public', 'demos', 'demos-manifest.json'),
        JSON.stringify(manifest, null, 2),
      );
    },
  };
}

export default defineConfig({
  plugins: [demoEntriesPlugin(), react(), vue(), svelte()],
  base: '/demos/',
  worker: { format: 'es' },
  publicDir: false,
  build: {
    outDir: 'public/demos',
    emptyOutDir: true,
    rollupOptions: {
      // Vite's app builds drop entry exports (HTML entries don't need them);
      // demo modules ARE their exports — keep mount().
      preserveEntrySignatures: 'strict',
      input: Object.fromEntries(demos.map((d) => [d.name, `${VIRTUAL_PREFIX}${d.name}.entry.js`])),
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
