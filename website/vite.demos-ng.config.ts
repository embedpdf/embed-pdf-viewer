import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

import { angularSamplesPlugin } from './src/lib/angular-demo-samples';
import { discoverSampleVariants, sampleScopeClass } from './src/lib/sample-discovery';
import { sampleStylesheetsPlugin } from './src/lib/sample-stylesheets';

/**
 * The Angular half of the live-demo pipeline — a SEPARATE Vite pass because
 * Angular needs its own esbuild dialect (experimentalDecorators +
 * useDefineForClassFields:false) that must not leak into the react/vue/svelte
 * pass (vite.demos.config.ts runs first with emptyOutDir; this pass appends
 * into the same public/demos).
 *
 * Demos bootstrap ZONELESS (the design rule that makes iframe-free Angular
 * demos safe: zone.js patches globals and would infect the whole docs app).
 * Convention: every Angular sample's root component is `export class App`,
 * with selector 'demo-root'.
 */
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = path.join(ROOT, 'src', 'samples');

const demos = discoverSampleVariants(SAMPLES, ['angular']);
const ENTRIES_DIR = path.join(ROOT, '.demo-ng-entries');

/** The framework-neutral `topic/base` of a demo (`topic/base.angular`). */
const demoKey = (name: string) => name.replace(/\.angular$/, '');

/**
 * Mounts the app into its own `<demo-root>` inside `el` and returns its unmount; `el` carries the
 * example's style scope meanwhile. The app bootstraps onto that element, not the page's first
 * `demo-root`, so several Angular examples on one page each get their own.
 */
function mountWrapper(entryAbs: string, scope: string): string {
  return `
    import '@angular/compiler';
    import { provideZonelessChangeDetection } from '@angular/core';
    import { createApplication } from '@angular/platform-browser';
    import { App } from ${JSON.stringify(entryAbs.replace(/\.ts$/, ''))};
    export function mount(el) {
      el.classList.add(${JSON.stringify(scope)});
      const host = document.createElement('demo-root');
      el.appendChild(host);
      const ref = createApplication({ providers: [provideZonelessChangeDetection()] }).then(
        (app) => {
          app.bootstrap(App, host);
          return app;
        },
      );
      ref.catch((err) => console.error('[demo] Angular bootstrap failed', err));
      return () => {
        void ref.then((app) => app.destroy()).catch(() => {});
        host.remove();
        el.classList.remove(${JSON.stringify(scope)});
      };
    }`;
}

function writeEntryFiles(): Record<string, string> {
  fs.rmSync(ENTRIES_DIR, { recursive: true, force: true });
  fs.mkdirSync(ENTRIES_DIR, { recursive: true });
  const input: Record<string, string> = {};
  for (const demo of demos) {
    const file = path.join(ENTRIES_DIR, `${demo.name.replace(/\//g, '__')}.entry.ts`);
    fs.writeFileSync(file, mountWrapper(demo.entry, sampleScopeClass(demoKey(demo.name))));
    input[demo.name] = file;
  }
  return input;
}

function demoEntriesPlugin(): Plugin {
  return {
    name: 'epdf-demo-ng-entries',
    writeBundle() {
      // Merge into the manifest the first pass wrote.
      const manifestPath = path.join(ROOT, 'public', 'demos', 'demos-manifest.json');
      let manifest: Record<string, Record<string, string>> = {};
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch {
        /* first pass missing — still write our half */
      }
      for (const demo of demos) {
        const topicBase = demoKey(demo.name);
        manifest[topicBase] ??= {};
        manifest[topicBase].angular = `/demos/${demo.name}.js`;
      }
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    },
  };
}

export default defineConfig({
  // Runtime JIT, no compiler plugin: the examples' decorators are emitted
  // (angularSamplesPlugin, then esbuild for the rest) and '@angular/compiler'
  // (imported by the mount wrapper) compiles templates at mount time. Template
  // correctness is enforced by `ngc` in the example check
  // (docs/content/scripts/samples.mjs) — the build pass only bundles. (The
  // Analog AOT plugin trips over this workspace's multi-instance TypeScript
  // graph; revisit if demos ever need AOT-sized bundles.)
  plugins: [
    demoEntriesPlugin(),
    // Signal inputs and queries as JIT reads them, and `styleUrl: './basic.css'` as the import
    // the other frameworks write (src/lib/angular-demo-samples.ts)…
    angularSamplesPlugin({ samplesRoot: SAMPLES }),
    // …which adds the stylesheet scoped to its example (src/lib/sample-stylesheets.ts).
    sampleStylesheetsPlugin({
      samplesRoot: SAMPLES,
      isExample: (key) => demos.some((demo) => demoKey(demo.name) === key),
    }),
  ],
  // Production mode, like the other frameworks' demos (Vite builds them with NODE_ENV=production):
  // no dev-mode checks in the reader's console. One of them would fire on every page with two
  // Angular examples: their roots share the `demo-root` selector, and NG0912 flags two root
  // components that hash to the same id. Harmless here (the styles are imports, not `styles`),
  // and the examples' own correctness is checked by `ngc` in the example check.
  define: { ngDevMode: 'false' },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
  base: '/demos/',
  publicDir: false,
  worker: { format: 'es' },
  build: {
    outDir: 'public/demos',
    emptyOutDir: false,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: writeEntryFiles(),
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
