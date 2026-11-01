/**
 * What a site's copy of the ready-made viewer's files says (`sync.mjs`): cloudpdf.com's names its
 * own viewer and gives its documents in the cloud's words; embedpdf.com's is the file as written.
 *
 *   node --test docs/content/scripts/*.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEMO_DOCUMENTS } from '../documents.mjs';
import { siteFiles, sitePages, transformViewerFile } from './sync.mjs';

const cloud = (source, file) => transformViewerFile(source, 'cloud', file);
const document = DEMO_DOCUMENTS.welcome.viewerCloud;

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
  EmbedPDF.init({ target: '#viewer', src: '/report.pdf' });
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
    const attribute = 'src="/report.pdf"';
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
  readonly welcome = '/pdfs/welcome.pdf';
  // [!/doc-source]
`;
    assert.equal(cloud(source, 'viewer/a.angular.ts'), `  readonly welcome = ${document};\n`);
    assert.equal(
      transformViewerFile(source, 'local', 'viewer/a.angular.ts'),
      "  readonly welcome = '/pdfs/welcome.pdf';\n",
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
    const source =
      'import { PDFViewer } from \'@embedpdf/viewer-react\';\n<PDFViewer src="/report.pdf" />\n';
    assert.equal(transformViewerFile(source, 'local', 'viewer/a.react.tsx'), source);
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
});
