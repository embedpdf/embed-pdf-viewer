import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import postcss, { type AtRule } from 'postcss';
import { defineConfig, type Plugin } from 'vite';

import { discoverSampleVariants, sampleScopeClass } from './src/lib/sample-discovery';

/**
 * The live-demo half of the samples pipeline (docs/conventions/docs-architecture.md).
 *
 * Every sample variant (single `<base>.<fw>.<ext>` file or `<base>.<fw>/`
 * directory — see src/lib/sample-discovery.ts) is wrapped in a virtual entry
 * exporting `mount(el) => unmount`, compiled by the framework's own Vite
 * plugin (this is how .vue/.svelte run inside a Next site with zero webpack
 * surgery), and emitted self-contained into `public/demos/` — the docs load
 * them with a native dynamic import at runtime.
 *
 * On this site the samples are the cloud emissions: they provision
 * `cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' })` and open the
 * shared demo document with its share grant — the demo a visitor watches is
 * the same HTTPS traffic the code panel tells them to write. No wasm rides
 * along; failures surface loudly in the preview (never a local fallback).
 */
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = path.join(ROOT, 'src', 'samples');

/** Mounts the app into `el` and returns its unmount; `el` carries the example's style scope meanwhile. */
const MOUNTABLE: Record<string, (abs: string, scope: string) => string> = {
  react: (abs, scope) => `
    import { createElement } from 'react';
    import { createRoot } from 'react-dom/client';
    import App from ${JSON.stringify(abs)};
    export function mount(el) {
      el.classList.add(${JSON.stringify(scope)});
      const root = createRoot(el);
      root.render(createElement(App));
      return () => {
        root.unmount();
        el.classList.remove(${JSON.stringify(scope)});
      };
    }`,
  vue: (abs, scope) => `
    import { createApp } from 'vue';
    import App from ${JSON.stringify(abs)};
    export function mount(el) {
      el.classList.add(${JSON.stringify(scope)});
      const app = createApp(App);
      app.mount(el);
      return () => {
        app.unmount();
        el.classList.remove(${JSON.stringify(scope)});
      };
    }`,
  svelte: (abs, scope) => `
    import { mount as svelteMount, unmount as svelteUnmount } from 'svelte';
    import App from ${JSON.stringify(abs)};
    export function mount(el) {
      el.classList.add(${JSON.stringify(scope)});
      const app = svelteMount(App, { target: el });
      return () => {
        svelteUnmount(app);
        el.classList.remove(${JSON.stringify(scope)});
      };
    }`,
};

const demos = discoverSampleVariants(SAMPLES, ['react', 'vue', 'svelte']);
const VIRTUAL_PREFIX = 'virtual:demo/';
const STYLESHEET_PREFIX = '\0epdf-sample-css:';

/** The framework-neutral `topic/base` of a demo (`topic/base.react`). */
const demoKey = (demo: { name: string; fw: string }) => demo.name.slice(0, -(demo.fw.length + 1));

/**
 * The `topic/base` a sample stylesheet belongs to: `<topic>/<base>.css`, or a
 * file inside a multi-file `<topic>/<base>.<fw>/` sample.
 */
function stylesheetKey(file: string): string {
  const relative = path.relative(SAMPLES, file).split(path.sep).join('/');
  return relative.replace(/\.(react|vue|svelte|angular)\/.*$/, '').replace(/\.css$/, '');
}

/**
 * Prefix every rule with the example's scope class (see `sampleScopeClass`):
 * `.toolbar` becomes `.<scope> .toolbar`, and `:root`, `html` or `body` become
 * the scope itself, the demo's mount element.
 */
function scopeStylesheet(css: string, scope: string): string {
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    const parent = rule.parent;
    if (parent?.type === 'atrule' && /keyframes$/i.test((parent as AtRule).name)) return;
    rule.selectors = rule.selectors.map((selector) =>
      /^(:root|html|body)\b/.test(selector)
        ? selector.replace(/^(:root|html|body)/, `.${scope}`)
        : `.${scope} ${selector}`,
    );
  });
  return root.toString();
}

/**
 * A sample imports its stylesheet the ordinary way (`import './basic.css'`),
 * which a reader copies as is. In a demo build that import becomes a module
 * that adds the stylesheet, scoped to its example, to the docs page once.
 */
function sampleStylesheetsPlugin(): Plugin {
  return {
    name: 'epdf-sample-stylesheets',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer?.startsWith(SAMPLES) || !source.endsWith('.css') || source.includes('?')) {
        return null;
      }
      // `.js` so Vite's own CSS handling leaves the module alone.
      return `${STYLESHEET_PREFIX}${path.resolve(path.dirname(importer.split('?')[0]), source)}.js`;
    },
    load(id) {
      if (!id.startsWith(STYLESHEET_PREFIX)) return null;
      const file = id.slice(STYLESHEET_PREFIX.length, -'.js'.length);
      this.addWatchFile(file);
      const key = stylesheetKey(file);
      if (!demos.some((demo) => demoKey(demo) === key)) {
        this.warn(`${key}.css belongs to no example: name it after the example that imports it`);
      }
      const scope = sampleScopeClass(key);
      const css = scopeStylesheet(fs.readFileSync(file, 'utf8'), scope);
      return `
        if (!document.getElementById(${JSON.stringify(scope)})) {
          const style = document.createElement('style');
          style.id = ${JSON.stringify(scope)};
          style.textContent = ${JSON.stringify(css)};
          document.head.appendChild(style);
        }`;
    },
  };
}

function demoEntriesPlugin(): Plugin {
  return {
    name: 'cpdf-demo-entries',
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
      return MOUNTABLE[demo.fw](demo.entry, sampleScopeClass(demoKey(demo)));
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
  plugins: [demoEntriesPlugin(), sampleStylesheetsPlugin(), react(), vue(), svelte()],
  base: '/demos/',
  worker: { format: 'es' },
  publicDir: false,
  build: {
    outDir: 'public/demos',
    emptyOutDir: true,
    rollupOptions: {
      // Vite's app builds drop entry exports (HTML entries don't need them);
      // demo modules are their exports — keep mount().
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
