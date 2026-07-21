import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

/**
 * The Angular half of the live-demo pipeline — a SEPARATE Vite pass because
 * Angular needs its own esbuild dialect (experimentalDecorators +
 * useDefineForClassFields:false) that must not leak into the react/vue/svelte
 * pass (vite.demos.config.ts runs first with emptyOutDir; this pass appends
 * into the same public/demos).
 *
 * Demos bootstrap ZONELESS (the design rule that makes iframe-free Angular
 * demos safe: zone.js patches globals and would infect the whole docs app).
 * Convention: every Angular sample's component uses selector 'demo-root'.
 */
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = path.join(ROOT, 'src', 'samples');

type DemoEntry = { name: string; abs: string };

function discoverAngularDemos(): DemoEntry[] {
  const demos: DemoEntry[] = [];
  if (!fs.existsSync(SAMPLES)) return demos;
  for (const topic of fs.readdirSync(SAMPLES, { withFileTypes: true })) {
    if (!topic.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(SAMPLES, topic.name))) {
      const match = file.match(/^(.+)\.angular\.ts$/);
      if (!match) continue;
      demos.push({
        name: `${topic.name}/${match[1]}.angular`,
        abs: path.join(SAMPLES, topic.name, file),
      });
    }
  }
  return demos;
}

const demos = discoverAngularDemos();
const ENTRIES_DIR = path.join(ROOT, '.demo-ng-entries');

function mountWrapper(abs: string): string {
  return `
    import '@angular/compiler';
    import { provideZonelessChangeDetection } from '@angular/core';
    import { bootstrapApplication } from '@angular/platform-browser';
    import { App } from ${JSON.stringify(abs.replace(/\.ts$/, ''))};
    export function mount(el) {
      const host = document.createElement('demo-root');
      el.appendChild(host);
      const ref = bootstrapApplication(App, {
        providers: [provideZonelessChangeDetection()],
      });
      ref.catch((err) => console.error('[demo] Angular bootstrap failed', err));
      return () => {
        void ref.then((app) => app.destroy()).catch(() => {});
        host.remove();
      };
    }`;
}

function writeEntryFiles(): Record<string, string> {
  fs.rmSync(ENTRIES_DIR, { recursive: true, force: true });
  fs.mkdirSync(ENTRIES_DIR, { recursive: true });
  const input: Record<string, string> = {};
  for (const demo of demos) {
    const file = path.join(ENTRIES_DIR, `${demo.name.replace(/\//g, '__')}.entry.ts`);
    fs.writeFileSync(file, mountWrapper(demo.abs));
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
        const topicBase = demo.name.replace(/\.angular$/, '');
        manifest[topicBase] ??= {};
        manifest[topicBase].angular = `/demos/${demo.name}.js`;
      }
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    },
  };
}

export default defineConfig({
  // Runtime JIT, no compiler plugin: esbuild emits the decorators and
  // '@angular/compiler' (imported by the mount wrapper) compiles templates at
  // mount time. Template CORRECTNESS is enforced by `ngc` in check:samples —
  // the build pass only bundles. (The Analog AOT plugin trips over this
  // workspace's multi-instance TypeScript graph; revisit if demos ever need
  // AOT-sized bundles.)
  plugins: [demoEntriesPlugin()],
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
