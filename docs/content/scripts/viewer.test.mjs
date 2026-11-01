/**
 * The viewer docs' own checks (`viewer.mjs`), on small pages of our own: a plain-HTML snippet's
 * scripts and elements, and the code a viewer page shows, each compiled against the site's viewer
 * at its source (`@embedpdf/viewer`, and `@cloudpdf/viewer` for cloudpdf.com's copy) and reported
 * at the page's own lines.
 *
 *   node --test docs/content/scripts/*.test.mjs
 *
 * The cases use what the viewer has had all along (`EmbedPDF.init`, `src`, a command's `id` and
 * `run`) and names it never will, so they hold while the viewer changes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { removeRunDirectory, runDirectory, VIEWER_INTEGRATIONS } from './compile.mjs';
import { checkVanilla, readPage } from './snippets.mjs';

const PAGE = `<input type="file" id="file" />
<div id="viewer" style="height: 100vh"></div>
<epdf-not-an-element></epdf-not-an-element>
<div slot="item:status">Outside the viewer</div>

<script type="module">
  import EmbedPDF from 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@3/dist/embedpdf.js';

  const element = EmbedPDF.init({ target: '#viewer', src: '/report.pdf' });
  document.getElementById('file').addEventListener('change', (event) => {
    console.log(event.target.files[0]);
  });
  element.notAViewerMember();
</script>

<script type="module" src="https://cdn.example.com/embedpdf.js"></script>
`;

const MDX = `# A page

\`\`\`js
{ src: '/report.pdf', notAConfigKey: true }
\`\`\`

\`\`\`js
{
  id: 'acme:approve',
  label: 'Approve',
  run: ({ documentId }) => approve(documentId),
}
\`\`\`

\`\`\`js
{ id: 'acme:flag', notACommandKey: true }
\`\`\`

<Engine cloud>

\`\`\`js
{ src: { token: 'only on cloudpdf.com' } }
\`\`\`

</Engine>

<Engine local>

\`\`\`js
{ scope: ['doc.open'] }
\`\`\`

</Engine>

<Fw only="vanilla">

\`\`\`ts
import type { ViewerConfig } from '@embedpdf/viewer';

export const config = { notAKeyEither: 1 } satisfies ViewerConfig;
\`\`\`

</Fw>
`;

/** cloudpdf.com's copy of a plain-HTML page: the cloud door's script, and a cloud document. */
const CLOUD_PAGE = `<embedpdf-viewer id="viewer" src="/report.pdf" style="height: 100vh"></embedpdf-viewer>

<script type="module">
  import CloudPDF from 'https://cdn.jsdelivr.net/npm/@cloudpdf/viewer@3/dist/cloudpdf.js';

  document.getElementById('viewer').src = { grant: 'grt_example' };
  CloudPDF.init({ target: '#other', src: { token: () => 'a token' }, scope: ['doc.open'] });
</script>
`;

let run;
let errors;
let cloudErrors;
let page;

const snippet = {
  file: 'viewer/test/page.vanilla.html',
  name: 'viewer/test/page',
  framework: 'vanilla',
  shownAs: 'viewer/test/page.html',
};

before(async () => {
  run = runDirectory('embedpdf-viewer-test');
  const snippets = path.join(run, 'snippets');
  fs.mkdirSync(path.join(snippets, 'viewer/test'), { recursive: true });
  fs.writeFileSync(path.join(snippets, 'viewer/test/page.vanilla.html'), PAGE);
  page = readPage(MDX, VIEWER_INTEGRATIONS, 'viewer/test.mdx');
  const result = await checkVanilla(
    [snippet],
    new Map([['viewer/test', page]]),
    path.join(run, 'vanilla'),
    snippets,
  );
  assert.ok(result.tool, result.reason);
  errors = result.bySnippet;

  const cloud = await checkVanilla(
    [snippet],
    new Map([['viewer/test', readPage(MDX, VIEWER_INTEGRATIONS, 'viewer/test.mdx', 'cloud')]]),
    path.join(run, 'cloud'),
    snippets,
    { engine: 'cloud', read: () => CLOUD_PAGE },
  );
  assert.ok(cloud.tool, cloud.reason);
  cloudErrors = cloud.bySnippet;
});

after(() => removeRunDirectory(run));

const on = (file, line, from = errors) =>
  (from.get(file) ?? []).filter((error) => error.line === line);

describe('a plain-HTML snippet', () => {
  const file = 'viewer/test/page.vanilla.html';

  it('reports a member the viewer lacks at the page’s own line', () => {
    assert.match(on(file, 13)[0]?.message ?? '', /notAViewerMember/);
  });

  it('leaves the page’s own DOM code alone', () => {
    assert.deepEqual(on(file, 10), []);
    assert.deepEqual(on(file, 11), []);
  });

  it('names an element the viewer does not define', () => {
    assert.match(on(file, 3)[0]?.message ?? '', /epdf-not-an-element/);
  });

  it('wants a slot on a child of the viewer, and the viewer from its CDN script', () => {
    assert.match(on(file, 4)[0]?.message ?? '', /child of <embedpdf-viewer>/);
    assert.match(on(file, 16)[0]?.message ?? '', /cdn\.example\.com/);
  });

  it('reports nothing else', () => {
    assert.deepEqual(
      (errors.get(file) ?? []).map((error) => error.line).sort((a, b) => a - b),
      [3, 4, 13, 16],
    );
  });
});

describe('the code a viewer page shows', () => {
  const file = 'viewer/test.mdx';

  it('checks a config object as the config, at the page’s line and column', () => {
    const [error] = on(file, 4);
    assert.match(error?.message ?? '', /notAConfigKey/);
    assert.equal(error?.column, 23);
  });

  it('checks an object with an `id` as a command, and leaves the reader’s own names alone', () => {
    assert.deepEqual(on(file, 8).concat(on(file, 9), on(file, 10), on(file, 11)), []);
    assert.match(on(file, 16)[0]?.message ?? '', /notACommandKey/);
  });

  it('skips the cloudpdf.com site’s code, and checks a TypeScript module as written', () => {
    assert.deepEqual(on(file, 22), []);
    assert.match(on(file, 40)[0]?.message ?? '', /notAKeyEither/);
  });

  it('knows which frameworks and which sites each block is for', () => {
    const typescript = page.code.find((block) => block.lang === 'ts');
    assert.deepEqual(typescript.integrations, ['vanilla']);
    assert.deepEqual(page.code.find((block) => block.line === 22)?.engines, ['cloud']);
    assert.deepEqual(page.code.find((block) => block.line === 30)?.engines, ['local']);
    assert.deepEqual(typescript.engines, ['local', 'cloud']);
  });
});

describe('cloudpdf.com’s copy', () => {
  const file = 'viewer/test.mdx';
  const html = 'viewer/test/page.vanilla.html';

  it('checks the cloud site’s code against the cloud config, and skips embedpdf.com’s', () => {
    assert.deepEqual(on(file, 22, cloudErrors), []);
    assert.deepEqual(on(file, 30, cloudErrors), []);
    // A URL isn't a cloud document.
    assert.match(
      on(file, 4, cloudErrors)[0]?.message ?? '',
      /'string' is not assignable to type 'DocumentSrc'/,
    );
  });

  it('wants a cloud document from script, and knows the cloud door', () => {
    assert.match(on(html, 1, cloudErrors)[0]?.message ?? '', /give it from script/);
    assert.deepEqual(on(html, 6, cloudErrors), []);
    assert.match(on(html, 7, cloudErrors)[0]?.message ?? '', /scope/);
  });

  it('reports nothing else', () => {
    assert.deepEqual(
      (cloudErrors.get(html) ?? []).map((error) => error.line).sort((a, b) => a - b),
      [1, 7],
    );
  });
});
