/**
 * What a site's copy of the ready-made viewer's files says (`sync.mjs`): cloudpdf.com's names its
 * own viewer and gives its documents in the cloud's words; embedpdf.com's is the file as written.
 *
 *   node --test docs/content/scripts/*.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEMO_DOCUMENTS } from '../documents.mjs';
import {
  documentProblems,
  pageExamples,
  siteFiles,
  sitePages,
  transformFile,
  transformViewerFile,
} from './sync.mjs';

const cloud = (source, file) => transformViewerFile(source, 'cloud', file);
const document = DEMO_DOCUMENTS.welcome.viewerCloud;
const WELCOME = 'https://www.embedpdf.com/pdfs/welcome.pdf';

describe('the cloud site’s copy of a viewer file', () => {
  it('names the cloud packages, but not a subpath only the local door has', () => {
    const source = [
      "import { PDFViewer } from '@embedpdf/viewer-react';",
      "import type { ViewerConfig } from '@embedpdf/viewer';",
      "import '@embedpdf/viewer/portable';",
      "import { useSearch } from '@embedpdf/react';",
      '',
    ].join('\n');
    assert.equal(
      cloud(source, 'viewer/a.react.tsx'),
      [
        "import { PDFViewer } from '@cloudpdf/viewer-react';",
        "import type { ViewerConfig } from '@cloudpdf/viewer';",
        "import '@embedpdf/viewer/portable';",
        "import { useSearch } from '@embedpdf/react';",
        '',
      ].join('\n'),
    );
    assert.equal(
      cloud('npm install @embedpdf/viewer-vue\n', 'viewer/a.vue.sh'),
      'npm install @cloudpdf/viewer-vue\n',
    );
  });

  it('loads the cloud CDN script, under its own default name', () => {
    const source = `<script type="module">
  import EmbedPDF from 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@3/dist/embedpdf.js';
  EmbedPDF.init({ target: '#viewer', src: '${WELCOME}' });
</script>
`;
    assert.equal(
      cloud(source, 'viewer/a.vanilla.html'),
      `<script type="module">
  import CloudPDF from 'https://cdn.jsdelivr.net/npm/@cloudpdf/viewer@3/dist/cloudpdf.js';
  CloudPDF.init({ target: '#viewer', src: ${document} });
</script>
`,
    );
  });

  it('binds a document attribute the way each framework binds one', () => {
    const attribute = `src="${WELCOME}"`;
    assert.equal(
      cloud(`<PDFViewer ${attribute} />`, 'viewer/a.react.tsx'),
      `<PDFViewer src={${document}} />`,
    );
    assert.equal(
      cloud(`<PDFViewer ${attribute} />`, 'viewer/a.svelte.svelte'),
      `<PDFViewer src={${document}} />`,
    );
    assert.equal(
      cloud(`<PDFViewer ${attribute} />`, 'viewer/a.vue.vue'),
      `<PDFViewer :src="${document}" />`,
    );
    assert.equal(
      cloud(`<epdf-pdf-viewer ${attribute} />`, 'viewer/a.angular.ts'),
      `<epdf-pdf-viewer [src]="${document}" />`,
    );
    // A plain HTML attribute holds only a string: that page is a per-site file.
    assert.equal(
      cloud(`<embedpdf-viewer ${attribute}>`, 'viewer/a.vanilla.html'),
      `<embedpdf-viewer ${attribute}>`,
    );
    // A URL that isn't a demo document stays, for the cloud check to report.
    assert.equal(
      cloud('<PDFViewer src="/other.pdf" />', 'viewer/a.react.tsx'),
      '<PDFViewer src="/other.pdf" />',
    );
  });

  it('keeps a doc-source block’s declaration and gives it the cloud document', () => {
    const source = `  // [!doc-source welcome]
  readonly welcome = '${WELCOME}';
  // [!/doc-source]
`;
    assert.equal(cloud(source, 'viewer/a.angular.ts'), `  readonly welcome = ${document};\n`);
    assert.equal(
      transformViewerFile(source, 'local', 'viewer/a.angular.ts'),
      `  readonly welcome = '${WELCOME}';\n`,
    );
    assert.throws(
      () =>
        cloud(
          "// [!doc-source welcome]\nconst welcome: string = '/x.pdf';\n// [!/doc-source]\n",
          'viewer/a.react.tsx',
        ),
      /declares one document, untyped/,
    );
  });

  it('takes no grant but a demo document’s', () => {
    assert.throws(
      () => cloud("el.src = { grant: 'grt_notTheDemoGrant' };\n", 'viewer/a.cloud.vanilla.html'),
      /isn't a demo document's grant/,
    );
    assert.equal(
      cloud("el.src = { grant: 'grt_…' };\n", 'viewer/a.vanilla.html'),
      "el.src = { grant: 'grt_…' };\n",
    );
  });

  it('leaves embedpdf.com’s copy as written', () => {
    const source = `import { PDFViewer } from '@embedpdf/viewer-react';\n<PDFViewer src="${WELCOME}" />\n`;
    assert.equal(transformViewerFile(source, 'local', 'viewer/a.react.tsx'), source);
  });
});

describe('characters of a demo document', () => {
  const sample = (engine, source) =>
    transformFile(source, engine, 'selection/a.vue/Select.vue', { viewer: false });
  const { local, cloud } = DEMO_DOCUMENTS.welcome.ranges.firstWord;
  const source = `  // [!doc-range welcome firstWord]
  selection.select({ page, start: ${local.start}, count: ${local.count} });
  // [!/doc-range]
`;

  it('are the site’s own copy’s', () => {
    assert.equal(
      sample('local', source),
      `  selection.select({ page, start: ${local.start}, count: ${local.count} });\n`,
    );
    assert.equal(
      sample('cloud', source),
      `  selection.select({ page, start: ${cloud.start}, count: ${cloud.count} });\n`,
    );
  });

  it('are named once, as the local copy has them', () => {
    assert.throws(
      () => sample('cloud', source.replace(`start: ${local.start}`, 'start: 3')),
      /names `start: \d+, count: \d+` once/,
    );
    assert.throws(
      () => sample('cloud', source.replace('firstWord', 'lastWord')),
      /unknown doc-range 'welcome lastWord'/,
    );
  });
});

describe('a demo document’s URL', () => {
  const sample = (engine, source) =>
    transformFile(source, engine, 'page-edit/a.react.tsx', { viewer: false });

  it('names the site’s own copy of the file', () => {
    const source = "const response = await fetch('https://www.embedpdf.com/pdfs/sketch.pdf');\n";
    assert.equal(sample('local', source), source);
    assert.equal(
      sample('cloud', source),
      "const response = await fetch('https://www.cloudpdf.com/pdfs/sketch.pdf');\n",
    );
  });

  it('still gives the viewer the cloud document', () => {
    assert.equal(
      transformFile(`<PDFViewer src="${WELCOME}" />`, 'cloud', 'viewer/a.react.tsx', {
        viewer: true,
      }),
      `<PDFViewer src={${document}} />`,
    );
  });

  it('is a full URL of a file the site serves', () => {
    const site = fileURLToPath(new URL('../../../website', import.meta.url));
    const expected = new Map([
      ['a.tsx', `fetch('${WELCOME}')`],
      ['b.tsx', "fetch('/pdfs/welcome.pdf')"],
      ['c.tsx', "fetch('https://www.embedpdf.com/pdfs/missing.pdf')"],
    ]);
    const [relative, missing, ...rest] = documentProblems(expected, 'local', site);
    assert.match(relative, /^b\.tsx: .*give its full URL/);
    assert.match(missing, /^c\.tsx: .*isn't a file the site serves/);
    assert.deepEqual(rest, []);
  });
});

describe('a per-site file', () => {
  const files = [
    'start/first.react.tsx',
    'start/first.vanilla.html',
    'start/first.cloud.vanilla.html',
    'start/pick.vue/App.vue',
    'start/pick.vue/List.vue',
    'start/pick.cloud.vue/App.vue',
    'start/first.css',
  ];

  it('replaces the shared one on its site, under the shared name', () => {
    assert.deepEqual(siteFiles(files, 'cloud'), [
      { source: 'start/first.react.tsx', emitAs: 'start/first.react.tsx' },
      { source: 'start/first.cloud.vanilla.html', emitAs: 'start/first.vanilla.html' },
      { source: 'start/pick.cloud.vue/App.vue', emitAs: 'start/pick.vue/App.vue' },
      { source: 'start/first.css', emitAs: 'start/first.css' },
    ]);
  });

  it('is left out of the other site', () => {
    assert.deepEqual(
      siteFiles(files, 'local').map(({ source }) => source),
      [
        'start/first.react.tsx',
        'start/first.vanilla.html',
        'start/pick.vue/App.vue',
        'start/pick.vue/List.vue',
        'start/first.css',
      ],
    );
  });
});

describe('a site’s pages', () => {
  const page = (engine, name) => sitePages('viewer', engine).find((p) => p.name === name);

  it('names a per-site page by the route it replaces', () => {
    assert.equal(page('cloud', 'self-hosting')?.source, 'viewer/self-hosting.cloud.mdx');
    assert.equal(page('local', 'self-hosting')?.source, 'viewer/self-hosting.mdx');
  });

  it('gives the cloud site its code in the cloud’s words, and its prose as written', () => {
    const [, code] = page('cloud', 'setup').mdx.split('```');
    assert.match(code, /from '@cloudpdf\/viewer'/);
    assert.match(page('cloud', 'setup').mdx, /install\n`@embedpdf\/viewer`/);
  });

  it('opens a demo document on the site’s own copy', () => {
    assert.match(
      page('cloud', 'documents').mdx,
      /'https:\/\/www\.cloudpdf\.com\/pdfs\/invoice\.pdf'/,
    );
    assert.doesNotMatch(page('cloud', 'documents').mdx, /www\.embedpdf\.com\/pdfs/);
  });
});

describe('the examples on a page of their own', () => {
  it('are the Examples section’s, each shown by its own page there, on both sites', () => {
    for (const engine of ['local', 'cloud']) {
      const examples = pageExamples(engine);
      assert.ok(examples.length > 0, engine);
      for (const { name, slug, source } of examples) {
        assert.equal(name, `viewer/examples/${slug}`);
        assert.match(source, new RegExp(`^viewer/examples/${slug}(\\.\\w+)?\\.mdx$`));
      }
    }
  });
});
