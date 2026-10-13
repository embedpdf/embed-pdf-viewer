import fs from 'node:fs';
import path from 'node:path';

import { parseAst, type Plugin } from 'vite';

import { sampleScopeClass } from './sample-discovery';
import { scopeStylesheet } from './sample-stylesheets';

/**
 * A plain-HTML example (`<topic>/<base>.vanilla.html`) as the demo build (vite.demos.config.ts)
 * mounts it. The page is what a reader copies: some markup, and module scripts that load the
 * viewer from its CDN script and talk to the elements. In a demo, which mounts into the docs page
 * itself, the page becomes a module exporting `mount(el)`, like every framework's:
 *
 * - The markup goes into `el` each time the demo mounts. A `<style>` in it is scoped to the
 *   example (`scopeStylesheet`), and `<link rel="stylesheet" href="./<base>.css">` becomes the
 *   import the other frameworks write, which `sampleStylesheetsPlugin` scopes.
 * - Each module script's imports move to the module's top; the rest of it runs after the markup
 *   is in, in order, each time the demo mounts. Its `document` finds elements in `el` only
 *   (`getElementById`, `querySelector`, `querySelectorAll`), so two examples on a page that both
 *   name an element `id="viewer"` each find their own.
 * - The viewer's CDN script (imported, or a `<script src>`) is the site's own build of it
 *   (`ViewerScript.module`, the viewer's `./snippet`). Nothing else loads from another origin.
 */

/** The viewer's CDN script, as a page loads it, and the package entry that is that script here. */
export interface ViewerScript {
  url: string;
  module: string;
}

const QUERY = '?epdf-vanilla-demo';

/** The id a demo entry imports a plain-HTML example's module by. */
export function vanillaDemoId(file: string): string {
  return `${file}${QUERY}`;
}

/** The `topic/base` a plain-HTML example is: `<topic>/<base>.vanilla.html`. */
function exampleKey(samplesRoot: string, file: string): string {
  return path
    .relative(samplesRoot, file)
    .split(path.sep)
    .join('/')
    .replace(/\.vanilla\.html$/, '');
}

function attribute(attributes: string, name: string): string | null {
  const match = attributes.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'),
  );
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

/** A script the browser runs: no `type`, a JavaScript one, or a module. */
const RUNS = new Set(['', 'module', 'text/javascript', 'application/javascript']);

const isRemote = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');

/** A demo's `document`: the page's, with elements looked up in the example's own `el`. */
const SCOPED_DOCUMENT = `function scopedDocument(el) {
  const own = {
    getElementById: (id) => el.querySelector(\`#\${CSS.escape(id)}\`),
    querySelector: (selectors) => el.querySelector(selectors),
    querySelectorAll: (selectors) => el.querySelectorAll(selectors),
  };
  return new Proxy(document, {
    get(target, key) {
      if (key in own) return own[key];
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}`;

/**
 * The module a plain-HTML example becomes: `source` is the page, `scope` its example's class,
 * `viewerScript` the viewer's CDN script. `fail(message)` throws (the plugin's `this.error`).
 */
export function vanillaDemoModule(
  source: string,
  options: { scope: string; viewerScript: ViewerScript; fail: (message: string) => never },
): string {
  const { scope, viewerScript, fail } = options;
  const imports: string[] = [];
  const scripts: string[] = [];
  const checkUrl = (url: string) => {
    if (isRemote(url) && url !== viewerScript.url) {
      fail(
        `loads ${url}: a plain-HTML example loads only the viewer's script, ${viewerScript.url}`,
      );
    }
  };

  const markup = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(
      /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
      (whole, attributes: string, body: string) => {
        if (!RUNS.has((attribute(attributes, 'type') ?? '').trim().toLowerCase())) return whole;
        const src = attribute(attributes, 'src');
        if (src !== null) {
          checkUrl(src);
          imports.push(`import ${JSON.stringify(src)};`);
        } else if (body.trim()) {
          scripts.push(body);
        }
        return '';
      },
    )
    .replace(/<link\b([^>]*?)\/?>/gi, (whole, attributes: string) => {
      const href = attribute(attributes, 'href');
      if ((attribute(attributes, 'rel') ?? '').toLowerCase() !== 'stylesheet' || href === null) {
        return whole;
      }
      if (!/^\.{1,2}\//.test(href)) {
        fail(`<link href="${href}">: link the example's own stylesheet, ./<name>.css`);
      }
      imports.push(`import ${JSON.stringify(href)};`);
      return '';
    })
    .replace(
      /<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi,
      (_, attributes: string, css: string) =>
        `<style${attributes}>${scopeStylesheet(css, scope)}</style>`,
    )
    .trim();

  // Each script's imports, as written, go to the module's top; the rest runs on every mount.
  const runs = scripts.map((body, index) => {
    let rest = '';
    let cursor = 0;
    for (const node of parseAst(body).body) {
      // Rollup's nodes say where they are in the source; its types leave that out.
      const { start, end } = node as typeof node & { start: number; end: number };
      if (node.type === 'ImportDeclaration') {
        checkUrl(String(node.source.value));
        imports.push(body.slice(start, end));
        rest += body.slice(cursor, start);
        cursor = end;
      } else if (node.type.startsWith('Export')) {
        fail("has a script that exports: a page's script exports nothing");
      }
    }
    rest += body.slice(cursor);
    return `async function script${index + 1}(document) {${rest}}`;
  });

  return [
    ...new Set(imports),
    '',
    `const scope = ${JSON.stringify(scope)};`,
    `const markup = ${JSON.stringify(markup)};`,
    '',
    SCOPED_DOCUMENT,
    '',
    ...runs,
    '',
    'export function mount(el) {',
    '  el.classList.add(scope);',
    '  el.innerHTML = markup;',
    '  const document = scopedDocument(el);',
    `  (async () => {${runs.map((_, index) => ` await script${index + 1}(document);`).join('')} })().catch(`,
    "    (error) => console.error('[demo]', error),",
    '  );',
    '  return () => {',
    '    el.replaceChildren();',
    '    el.classList.remove(scope);',
    '  };',
    '}',
    '',
  ].join('\n');
}

/**
 * Builds a plain-HTML example's module (`vanillaDemoId(file)`, which its demo entry imports), and
 * resolves the viewer's CDN script to the site's build of it.
 */
export function vanillaSamplesPlugin(options: {
  samplesRoot: string;
  viewerScript: ViewerScript;
}): Plugin {
  const { samplesRoot, viewerScript } = options;
  return {
    name: 'epdf-vanilla-samples',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source.endsWith(QUERY)) return source;
      if (source === viewerScript.url) {
        return this.resolve(viewerScript.module, importer, { skipSelf: true });
      }
      return null;
    },
    load(id) {
      if (!id.endsWith(QUERY)) return null;
      const file = id.slice(0, -QUERY.length);
      this.addWatchFile(file);
      const key = exampleKey(samplesRoot, file);
      return vanillaDemoModule(fs.readFileSync(file, 'utf8'), {
        scope: sampleScopeClass(key),
        viewerScript,
        fail: (message) => this.error(`${key}.vanilla.html ${message}`),
      });
    },
  };
}
