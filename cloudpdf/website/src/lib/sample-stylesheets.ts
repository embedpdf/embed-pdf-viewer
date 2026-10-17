import fs from 'node:fs';
import path from 'node:path';

import postcss, { type AtRule } from 'postcss';
import type { Plugin } from 'vite';

import { sampleScopeClass } from './sample-discovery';

/**
 * An example's stylesheet in the demo builds (vite.demos.config.ts, vite.demos-ng.config.ts).
 *
 * Every framework's version of an example uses the same `<topic>/<base>.css`, with plain class
 * names and `:root` variables, as a reader copies it. React, Vue and Svelte import it
 * (`import './basic.css'`); Angular names it in `styleUrl` with `ViewEncapsulation.None`, which
 * the Angular pass turns into that import (angular-demo-samples.ts). In a demo, which mounts into
 * the docs page itself, the import adds the stylesheet scoped to its example's class
 * (`sampleScopeClass`) to the page, once.
 */

/** The `topic/base` a sample stylesheet belongs to: `<topic>/<base>.css`, or a file inside a `<topic>/<base>.<fw>/` sample. */
export function stylesheetKey(samplesRoot: string, file: string): string {
  const relative = path.relative(samplesRoot, file).split(path.sep).join('/');
  return relative.replace(/\.(react|vue|svelte|angular)\/.*$/, '').replace(/\.css$/, '');
}

/**
 * Prefix every rule with the example's scope class: `.toolbar` becomes `.<scope> .toolbar`, and
 * `:root`, `html` or `body` become the scope itself, the demo's mount element.
 */
export function scopeStylesheet(css: string, scope: string): string {
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

const STYLESHEET_PREFIX = '\0epdf-sample-css:';

/**
 * A sample's `import './basic.css'` becomes a module that adds the stylesheet, scoped to its
 * example, to the docs page once. The importer may be a framework's sub-module of the sample
 * (`App.vue?vue&type=script…`). `isExample(key)` says whether `topic/base` is an example of this
 * build, to warn about a stylesheet named after none.
 */
export function sampleStylesheetsPlugin(options: {
  samplesRoot: string;
  isExample: (key: string) => boolean;
}): Plugin {
  const { samplesRoot, isExample } = options;
  return {
    name: 'epdf-sample-stylesheets',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer?.startsWith(samplesRoot) || !source.endsWith('.css') || source.includes('?')) {
        return null;
      }
      // `.js` so Vite's own CSS handling leaves the module alone.
      return `${STYLESHEET_PREFIX}${path.resolve(path.dirname(importer.split('?')[0]), source)}.js`;
    },
    load(id) {
      if (!id.startsWith(STYLESHEET_PREFIX)) return null;
      const file = id.slice(STYLESHEET_PREFIX.length, -'.js'.length);
      this.addWatchFile(file);
      const key = stylesheetKey(samplesRoot, file);
      if (!isExample(key)) {
        this.warn(`${key}.css belongs to no example: name it after the example that uses it`);
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
