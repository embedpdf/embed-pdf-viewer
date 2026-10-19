import fs from 'node:fs';
import path from 'node:path';

import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
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

type Element = DefaultTreeAdapterTypes.Element;

/** An element's attribute as the browser reads it, or null when it has none. */
function attribute(element: Element, name: string): string | null {
  return element.attrs.find((attr) => attr.name === name)?.value ?? null;
}

/** The text a script or style element holds. */
const textOf = (element: Element): string =>
  element.childNodes.map((child) => ('value' in child ? child.value : '')).join('');

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

  // The page as a browser parses it, so a comment, a script's text or an attribute's value is never
  // taken for a tag. Each edit replaces one node's source; the rest of the page stays as written.
  const edits: { start: number; end: number; text: string }[] = [];
  const stylesheets: string[] = [];
  const visit = (parent: DefaultTreeAdapterTypes.ParentNode): void => {
    for (const node of parent.childNodes) {
      if (node.nodeName === '#comment') {
        const at = node.sourceCodeLocation;
        if (at) edits.push({ start: at.startOffset, end: at.endOffset, text: '' });
        continue;
      }
      if (!('tagName' in node)) continue;
      const at = node.sourceCodeLocation;
      if (node.tagName === 'script') {
        if (!RUNS.has((attribute(node, 'type') ?? '').trim().toLowerCase())) continue;
        const src = attribute(node, 'src');
        if (src !== null) {
          checkUrl(src);
          imports.push(`import ${JSON.stringify(src)};`);
        } else if (textOf(node).trim()) {
          scripts.push(textOf(node));
        }
        if (at) edits.push({ start: at.startOffset, end: at.endOffset, text: '' });
      } else if (node.tagName === 'link') {
        const href = attribute(node, 'href');
        if ((attribute(node, 'rel') ?? '').toLowerCase() !== 'stylesheet' || href === null) {
          continue;
        }
        if (!/^\.{1,2}\//.test(href)) {
          fail(`<link href="${href}">: link the example's own stylesheet, ./<name>.css`);
        }
        stylesheets.push(`import ${JSON.stringify(href)};`);
        if (at) edits.push({ start: at.startOffset, end: at.endOffset, text: '' });
      } else if (node.tagName === 'style') {
        if (at?.startTag && at.endTag) {
          const css = scopeStylesheet(textOf(node), scope);
          edits.push({ start: at.startTag.endOffset, end: at.endTag.startOffset, text: css });
        }
      } else if (node.tagName !== 'template') {
        // A template's content never runs as the page loads, so its scripts stay in the markup.
        visit(node);
      }
    }
  };
  visit(parseFragment(source, { sourceCodeLocationInfo: true }));
  let markup = source;
  for (const { start, end, text } of edits.sort((a, b) => b.start - a.start)) {
    markup = markup.slice(0, start) + text + markup.slice(end);
  }
  markup = markup.trim();
  // The script tags' imports come first, then the stylesheets'.
  imports.push(...stylesheets);

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
