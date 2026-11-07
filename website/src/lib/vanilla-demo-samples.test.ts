import { describe, expect, it } from 'vitest';

import { vanillaDemoModule, type ViewerScript } from './vanilla-demo-samples';

const VIEWER: ViewerScript = {
  url: 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@3/dist/embedpdf.js',
  module: '@embedpdf/viewer/snippet',
};

const PAGE = `<embedpdf-viewer id="viewer" style="height: 100%"></embedpdf-viewer>

<script type="module">
  import '${VIEWER.url}';

  const welcome = '/pdfs/welcome.pdf';

  document.getElementById('viewer').config = { src: welcome };
</script>
`;

const fail = (message: string): never => {
  throw new Error(message);
};

const moduleOf = (page: string) =>
  vanillaDemoModule(page, { scope: 'epdf-example--viewer-page', viewerScript: VIEWER, fail });

/** The module's `mount`, run on stand-ins for the page's `document` and an example's `el`. */
function mountOf(code: string) {
  const body = code
    .replace(/^import .*$/gm, '')
    .replace('export function mount(el)', 'function mount(el)');
  const document = { title: 'the docs page' };
  const CSS = { escape: (value: string) => value };
  return new Function('document', 'CSS', `${body}\nreturn mount;`)(document, CSS) as (
    el: unknown,
  ) => () => void;
}

/** An example's mount element: its markup, its classes, and the elements `#id` finds in it. */
function mountElement() {
  const elements = new Map<string, Record<string, unknown>>();
  const classes = new Set<string>();
  return {
    elements,
    classes,
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
    },
    innerHTML: '',
    querySelector(selector: string) {
      const id = selector.replace(/^#/, '');
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    },
    replaceChildren() {
      this.innerHTML = '';
      elements.clear();
    },
  };
}

describe('a plain-HTML example in the demo build', () => {
  it("moves a script's imports to the top and leaves the markup without scripts", () => {
    const code = moduleOf(PAGE);

    expect(code.startsWith(`import '${VIEWER.url}';\n`)).toBe(true);
    expect(code).toContain(
      'const markup = "<embedpdf-viewer id=\\"viewer\\" style=\\"height: 100%\\"></embedpdf-viewer>";',
    );
    expect(code).not.toContain('<script');
  });

  it('runs the scripts on every mount, finding the elements in its own mount element', async () => {
    const mount = mountOf(moduleOf(PAGE));
    const el = mountElement();

    const unmount = mount(el);
    await Promise.resolve();

    expect(el.innerHTML).toContain('<embedpdf-viewer id="viewer"');
    expect(el.classes.has('epdf-example--viewer-page')).toBe(true);
    expect(el.elements.get('viewer')).toEqual({
      config: { src: '/pdfs/welcome.pdf' },
    });

    unmount();
    expect(el.innerHTML).toBe('');
    expect(el.classes.size).toBe(0);

    mount(el);
    await Promise.resolve();
    expect(el.elements.get('viewer')).toHaveProperty('config');
  });

  it('loads the viewer from its CDN script tag the same way', () => {
    const code = moduleOf(
      `<embedpdf-viewer src="/report.pdf"></embedpdf-viewer>\n<script type="module" src="${VIEWER.url}"></script>\n`,
    );

    expect(code.startsWith(`import ${JSON.stringify(VIEWER.url)};\n`)).toBe(true);
    expect(code).toContain(
      'const markup = "<embedpdf-viewer src=\\"/report.pdf\\"></embedpdf-viewer>";',
    );
  });

  it("imports the example's stylesheet as the frameworks do, and scopes a style element", () => {
    const code = moduleOf(
      '<link rel="stylesheet" href="./page.css">\n<style>.toolbar { display: flex; }</style>\n',
    );

    expect(code).toContain('import "./page.css";');
    expect(code).toContain('.epdf-example--viewer-page .toolbar { display: flex; }');
  });

  it('loads nothing else from another origin', () => {
    expect(() =>
      moduleOf(`<script type="module">import 'https://example.com/x.js';</script>`),
    ).toThrow(
      /loads https:\/\/example\.com\/x\.js: a plain-HTML example loads only the viewer's script/,
    );
    expect(() => moduleOf('<script src="https://example.com/x.js"></script>')).toThrow(
      /loads only the viewer's script/,
    );
  });

  it('leaves a script that exports for the page to fix', () => {
    expect(() => moduleOf('<script type="module">export const a = 1;</script>')).toThrow(
      /a page's script exports nothing/,
    );
  });

  it('reads the page as a browser does: comments, attribute values and end tags', () => {
    const code = moduleOf(
      [
        '<div title="<script>stays();</script>"></div>',
        '<!-- <script type="module">commentedOut();</script> -->',
        '<script type="module">runs();</script\t\n foo>',
      ].join('\n'),
    );

    expect(code).toContain('const markup = "<div title=\\"<script>stays();</script>\\"></div>";');
    expect(code).toContain('async function script1(document) {runs();}');
    expect(code).not.toContain('commentedOut');
    expect(code).not.toContain('script2');
  });

  it('keeps a script that never runs, such as JSON, in the markup', () => {
    const code = moduleOf('<script type="application/json">{"a":1}</script>');

    expect(code).toContain('<script type=\\"application/json\\">{\\"a\\":1}</script>');
  });
});
